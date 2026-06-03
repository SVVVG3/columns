/**
 * Farcaster protocol stores mentions separately from the cast text, using byte
 * offsets into the UTF-8-encoded text string. Hypersnap surfaces this raw
 * format. This utility reconstructs the display text by inserting @username at
 * each mention's byte position so the rest of the client code (which expects
 * Neynar-style embedded mentions) continues to work unchanged.
 */

interface MentionRange {
  start: number;
  end: number;
}

interface MentionedProfile {
  username?: string;
}

export function reconstructCastText(
  text: string,
  profiles: MentionedProfile[],
  ranges: MentionRange[]
): string {
  if (!ranges?.length || !profiles?.length) return text;

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // Sort descending by byte position so that earlier insertions don't shift
  // the positions of later ones.
  const sorted = ranges
    .map((r, i) => ({ start: r.start, end: r.end, username: profiles[i]?.username ?? "" }))
    .filter((m) => m.username)
    .sort((a, b) => b.start - a.start);

  const bytes = [...enc.encode(text)];

  for (const { start, end, username } of sorted) {
    const mentionBytes = [...enc.encode(`@${username}`)];
    bytes.splice(start, end - start, ...mentionBytes);
  }

  return dec.decode(new Uint8Array(bytes));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCast(cast: Record<string, any>): Record<string, any> {
  return {
    ...cast,
    text: reconstructCastText(
      cast.text ?? "",
      cast.mentioned_profiles ?? [],
      cast.mentioned_profiles_ranges ?? []
    ),
  };
}

/** Recursively normalize a cast tree (root cast + nested direct_replies). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCastTree(cast: Record<string, any>): Record<string, any> {
  const normalized = normalizeCast(cast);
  if (Array.isArray(normalized.direct_replies)) {
    return {
      ...normalized,
      direct_replies: normalized.direct_replies.map(normalizeCastTree),
    };
  }
  return normalized;
}
