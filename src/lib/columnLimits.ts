/** Max feed columns per user (add/import blocked at this count). */
export const MAX_COLUMNS = 10;

export function remainingColumnSlots(currentCount: number): number {
  return Math.max(0, MAX_COLUMNS - currentCount);
}

export function canAddColumns(currentCount: number, toAdd = 1): boolean {
  return currentCount + toAdd <= MAX_COLUMNS;
}
