import type { OGData } from "@/lib/ogLookup";

/** Extract tweet text from the HTML blockquote that Twitter's oEmbed returns. */
function parseTweetHtml(html: string): string {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) return "";
  return match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .trim();
}

function metaContent(html: string, prop: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  return (html.match(re) ?? html.match(re2))?.[1] ?? "";
}

function isTwitterUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i.test(url);
}

async function readHeadHtml(res: Response, maxBytes = 48_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  while (html.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel();
  return html;
}

/** Dynamic image endpoints (e.g. /api/images/leaderboard) have no extension in the URL. */
async function probeDirectImage(url: string): Promise<OGData | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "FarcasterDesktopClient/1.0" },
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (ct?.startsWith("image/")) {
      return { image: url, isDirectImage: true };
    }
  } catch {
    /* not a direct image */
  }
  return null;
}

async function scrapeOgImage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "facebookexternalhit/1.1", Accept: "text/html" },
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await readHeadHtml(res);
    return metaContent(html, "og:image") || metaContent(html, "twitter:image");
  } catch {
    return "";
  }
}

export async function fetchOG(url: string): Promise<OGData> {
  if (isTwitterUrl(url)) {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`;
    const [oembedRes, tweetImage] = await Promise.all([
      fetch(oembedUrl, {
        headers: { "User-Agent": "FarcasterDesktopClient/1.0" },
        signal: AbortSignal.timeout(4000),
      }).catch(() => null),
      scrapeOgImage(url),
    ]);

    if (!oembedRes?.ok) return {};
    const data = await oembedRes.json();
    const tweetText = parseTweetHtml(data.html ?? "");
    const handleMatch = (data.author_url as string ?? "").match(/\/([^/]+)\/?$/);
    return {
      tweetText,
      tweetAuthor: data.author_name ?? "",
      tweetHandle: handleMatch ? `@${handleMatch[1]}` : "",
      image: tweetImage || undefined,
      siteName: "X (Twitter)",
    };
  }

  const directImage = await probeDirectImage(url);
  if (directImage) return directImage;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(4500),
    redirect: "follow",
  });
  if (!res.ok) return {};

  const responseType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (responseType?.startsWith("image/")) {
    return { image: url, isDirectImage: true };
  }

  const html = await readHeadHtml(res);
  const ogTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  const ogDesc = metaContent(html, "og:description") || metaContent(html, "twitter:description");
  const ogImage = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  const siteName = metaContent(html, "og:site_name");
  const fcFrameRaw =
    metaContent(html, "fc:miniapp") ||
    metaContent(html, "fc:frame") ||
    metaContent(html, "of:version");

  if (fcFrameRaw) {
    const decoded = fcFrameRaw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    let frameImage = "";
    let frameButton = "";

    try {
      const frameData = JSON.parse(decoded) as {
        imageUrl?: string;
        button?: { title?: string };
      };
      if (frameData.imageUrl) frameImage = frameData.imageUrl;
      if (frameData.button?.title) frameButton = frameData.button.title;
    } catch {
      frameImage = metaContent(html, "fc:frame:image");
      frameButton =
        metaContent(html, "fc:frame:button:1") ||
        metaContent(html, "fc:frame:button:2");
    }

    return {
      isFrame: true,
      title: ogTitle,
      description: ogDesc,
      image: ogImage,
      frameImage: frameImage || ogImage,
      frameButton,
      siteName,
    };
  }

  return { title: ogTitle, description: ogDesc, image: ogImage, siteName };
}
