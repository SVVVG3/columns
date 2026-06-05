import type { FeedColumnConfig } from "@/types";

export function getUserFeedColumns(columns: FeedColumnConfig[]): FeedColumnConfig[] {
  return columns.filter((c) => c.type === "user");
}

export function userColumnTargetFids(column: FeedColumnConfig): number[] {
  if (column.type !== "user") return [];
  return column.targetFids ?? (column.targetFid != null ? [column.targetFid] : []);
}

export function userColumnHasFid(column: FeedColumnConfig, fid: number): boolean {
  return userColumnTargetFids(column).includes(fid);
}

export function userColumnTitleForFids(
  fids: number[],
  username: string
): string {
  if (fids.length <= 1) return `@${username.replace(/^@/, "")}`;
  return `${fids.length} users`;
}
