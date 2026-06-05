/** Farcaster Snap manifest host (interactive UI in casts). */
export const SNAP_HOST_PATTERN =
  /^https?:\/\/snap-host\.farcaster\.xyz\/[0-9a-f-]{36}\/?$/i;

/** Neynar-hosted snap manifests (e.g. vendyz-raffle-snap.host.neynar.app). */
export const NEYNAR_SNAP_HOST_PATTERN =
  /^https?:\/\/[a-z0-9-]+\.host\.neynar\.app\/?/i;

export const SNAP_MANIFEST_ACCEPT = "application/vnd.farcaster.snap+json";

export function isNeynarSnapHost(hostname: string): boolean {
  return /\.host\.neynar\.app$/i.test(hostname);
}

export function isSnapEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (
      u.hostname === "snap-host.farcaster.xyz" &&
      /^\/[0-9a-f-]{36}\/?$/i.test(u.pathname)
    ) {
      return true;
    }
    return isNeynarSnapHost(u.hostname);
  } catch {
    return false;
  }
}

/** Farcaster.xyz conversation URL for a cast (interactive snap lives on the cast). */
export function castConversationUrl(hash: string): string {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `https://farcaster.xyz/~/conversations/${h}`;
}

/** Canonical snap URL (manifest fetch target). */
export function normalizeSnapUrl(url: string): string {
  try {
    const u = new URL(url);
    if (isNeynarSnapHost(u.hostname)) {
      const path = u.pathname.replace(/\/$/, "") || "";
      return path ? `${u.origin}${path}/` : `${u.origin}/`;
    }
    const id = u.pathname.replace(/\//g, "").toLowerCase();
    if (u.hostname === "snap-host.farcaster.xyz" && /^[0-9a-f-]{36}$/.test(id)) {
      return `https://snap-host.farcaster.xyz/${id}/`;
    }
    return url;
  } catch {
    return url;
  }
}

export interface SnapPreview {
  title?: string;
  subtitle?: string;
  buttons: string[];
}

type SnapElement = {
  type?: string;
  props?: Record<string, unknown>;
  children?: string[];
  on?: Record<string, unknown>;
};

type SnapManifest = {
  version?: string;
  ui?: {
    root?: string;
    elements?: Record<string, SnapElement>;
  };
};

function elementText(el: SnapElement | undefined): string | undefined {
  if (!el?.props) return undefined;
  const content = el.props.content;
  return typeof content === "string" && content.trim() ? content.trim() : undefined;
}

function walkElements(
  elements: Record<string, SnapElement>,
  rootId: string | undefined,
  visit: (el: SnapElement) => void
) {
  if (!rootId || !elements[rootId]) return;
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const el = elements[id];
    if (!el) continue;
    visit(el);
    for (const child of el.children ?? []) {
      if (typeof child === "string") queue.push(child);
    }
  }
}

/** Build a feed preview from a Snap v2 manifest JSON. */
export function parseSnapPreview(manifest: SnapManifest): SnapPreview {
  const elements = manifest.ui?.elements ?? {};
  const root = manifest.ui?.root;
  const texts: string[] = [];
  const buttons: string[] = [];

  walkElements(elements, root, (el) => {
    if (el.type === "text") {
      const t = elementText(el);
      if (t) texts.push(t);
    }
    if (el.type === "button") {
      const label = el.props?.label;
      if (typeof label === "string" && label.trim()) buttons.push(label.trim());
    }
  });

  const title =
    texts.find((t) => t.length > 0) ??
    elements.title ? elementText(elements.title) : undefined;
  const subtitle =
    texts.find((t) => t !== title) ??
    (elements.subheader ? elementText(elements.subheader) : undefined);

  return {
    title,
    subtitle,
    buttons: [...new Set(buttons)].slice(0, 6),
  };
}
