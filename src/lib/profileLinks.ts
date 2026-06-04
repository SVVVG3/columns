export interface ProfileLink {
  kind: "url" | "twitter" | "github";
  label: string;
  href: string;
}

function readProfileString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const s = value.trim();
    return s || undefined;
  }
  if (value && typeof value === "object") {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") {
      const s = text.trim();
      return s || undefined;
    }
  }
  return undefined;
}

function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function twitterHref(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  return `https://x.com/${encodeURIComponent(clean)}`;
}

function githubHref(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  return `https://github.com/${encodeURIComponent(clean)}`;
}

function linkFromVerifiedAccount(entry: unknown): ProfileLink | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const platform = String(e.platform ?? e.type ?? "").toLowerCase();
  const username =
    (typeof e.username === "string" && e.username) ||
    (typeof e.handle === "string" && e.handle) ||
    "";
  if (!username.trim()) return null;

  if (platform === "x" || platform === "twitter") {
    const clean = username.replace(/^@/, "");
    return { kind: "twitter", label: `@${clean}`, href: twitterHref(clean) };
  }
  if (platform === "github") {
    const clean = username.replace(/^@/, "");
    return { kind: "github", label: `@${clean}`, href: githubHref(clean) };
  }
  return null;
}

/** Profile URL / X / GitHub from `profile` object and `verified_accounts`. */
export function buildProfileLinks(
  profile: Record<string, unknown> | undefined,
  verifiedAccounts: unknown[] | undefined
): ProfileLink[] {
  const links: ProfileLink[] = [];
  const seen = new Set<string>();

  const push = (link: ProfileLink | null) => {
    if (!link || seen.has(link.href)) return;
    seen.add(link.href);
    links.push(link);
  };

  const url = profile && readProfileString(profile.url);
  if (url) {
    const href = normalizeUrl(url);
    let label = url;
    try {
      label = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    push({ kind: "url", label, href });
  }

  const twitter =
    profile &&
    (readProfileString(profile.twitter) || readProfileString(profile.x));
  if (twitter) {
    const clean = twitter.replace(/^@/, "");
    push({ kind: "twitter", label: `@${clean}`, href: twitterHref(clean) });
  }

  const github = profile && readProfileString(profile.github);
  if (github) {
    const clean = github.replace(/^@/, "");
    push({ kind: "github", label: `@${clean}`, href: githubHref(clean) });
  }

  for (const entry of verifiedAccounts ?? []) {
    push(linkFromVerifiedAccount(entry));
  }

  return links;
}
