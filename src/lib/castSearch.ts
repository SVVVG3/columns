/** Hypersnap cast search page — flat or wrapped in `result`. */
export interface CastSearchPage {
  casts: Record<string, unknown>[];
  next?: { cursor?: string | null };
}

export type RawCastSearchResponse = {
  casts?: Record<string, unknown>[];
  next?: { cursor?: string | null };
  result?: {
    casts?: Record<string, unknown>[];
    next?: { cursor?: string | null };
  };
};

/** Normalize GET /v2/farcaster/cast/search (Hypersnap uses `{ result: { casts } }`). */
export function normalizeCastSearchResponse(raw: RawCastSearchResponse): CastSearchPage {
  const page = raw.result ?? raw;
  return {
    casts: page.casts ?? [],
    next: page.next,
  };
}
