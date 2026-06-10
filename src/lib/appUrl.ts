/** Canonical site URL (no trailing slash). */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "https://mycolumns.xyz";
  return raw.replace(/\/$/, "");
}

export function getAppHostname(): string {
  return new URL(getAppUrl()).hostname;
}

export function profileShareUrl(username: string): string {
  const clean = username.replace(/^@/, "").trim();
  return `${getAppUrl()}/profile/${encodeURIComponent(clean)}`;
}

export function profileOgImageUrl(username: string): string {
  const clean = username.replace(/^@/, "").trim();
  return `${getAppUrl()}/api/og/profile?username=${encodeURIComponent(clean)}`;
}

export const COLUMNS_FARCASTER_USERNAME = "columns";

/** Farcaster client mini app directory link (desktop auth screen CTA). */
export const COLUMNS_FARCASTER_MINIAPP_URL =
  "https://farcaster.xyz/miniapps/1VQ3HHkd4Ahy/columns";

export function columnsFarcasterProfileUrl(): string {
  return `https://farcaster.xyz/${COLUMNS_FARCASTER_USERNAME}`;
}

export function columnsCommunityChannelUrl(): string {
  return "https://farcaster.xyz/~/channel/columns";
}
