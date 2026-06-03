export type FeedColumnType =
  | "home"
  | "channel"
  | "user"
  | "keyword"
  | "trending";

export interface FeedColumnConfig {
  id: string;
  type: FeedColumnType;
  title: string;
  /** For "channel" type: array of channel IDs (e.g. ["memes", "dev"]) */
  channelIds?: string[];
  /** For "user" type: one or more target FIDs */
  targetFids?: number[];
  /** @deprecated use targetFids instead */
  targetFid?: number;
  /** For "keyword" type: one or more search query strings */
  queries?: string[];
  /** @deprecated use queries instead */
  query?: string;
  /** Refresh interval in ms (default 30000) */
  refreshInterval?: number;
}

export interface PersistedLayout {
  schemaVersion: 1 | 2 | 3;
  columns: FeedColumnConfig[];
}

export interface SessionUser {
  fid: number;
  signerUuid: string;
  username: string;
  displayName: string;
  pfpUrl: string;
}
