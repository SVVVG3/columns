import { MAX_COLUMNS } from "@/lib/columnLimits";
import type { FeedColumnConfig } from "@/types";

/** Home feed column — always shown first in the mini app. */
export const MINIAPP_HOME_COLUMN: FeedColumnConfig = {
  id: "home",
  type: "home",
  title: "Home Feed",
};

/** Non-Pro users may save one custom column (home is separate). */
export const MINIAPP_FREE_CUSTOM_COLUMNS = 1;

/** Pro users may save up to the desktop column limit (home is separate). */
export const MINIAPP_PRO_CUSTOM_COLUMNS = MAX_COLUMNS;

export function maxCustomColumnsForUser(isPro: boolean): number {
  return isPro ? MINIAPP_PRO_CUSTOM_COLUMNS : MINIAPP_FREE_CUSTOM_COLUMNS;
}

export function extractCustomColumns(columns: FeedColumnConfig[]): FeedColumnConfig[] {
  return columns.filter((c) => c.type !== "home");
}

/** Build the feed picker list: home + saved custom columns (capped by tier). */
export function buildMiniAppColumnList(
  savedColumns: FeedColumnConfig[],
  isPro: boolean
): FeedColumnConfig[] {
  const maxCustom = maxCustomColumnsForUser(isPro);
  const custom = extractCustomColumns(savedColumns).slice(0, maxCustom);
  return [MINIAPP_HOME_COLUMN, ...custom];
}
