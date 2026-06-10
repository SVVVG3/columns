/** Max feed columns per user on desktop (add/import blocked at this count). */
export const MAX_COLUMNS = 10;

/** Max custom columns in the mini app for non-Pro users (home feed is separate). */
export const MINIAPP_FREE_CUSTOM_COLUMNS = 1;

export function remainingColumnSlots(currentCount: number): number {
  return Math.max(0, MAX_COLUMNS - currentCount);
}

export function canAddColumns(currentCount: number, toAdd = 1): boolean {
  return currentCount + toAdd <= MAX_COLUMNS;
}
