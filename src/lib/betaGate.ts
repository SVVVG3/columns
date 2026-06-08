/** Site-wide beta password gate (before SIWN). Edge-safe — no Node crypto. */

export function isBetaGateEnabled(): boolean {
  return process.env.BETA_GATE_ENABLED === "true";
}

/** Parsed from ALLOWED_FIDS=123,456 */
export function getAllowedFids(): Set<number> {
  const raw = process.env.ALLOWED_FIDS ?? "";
  const fids = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10);
    if (!Number.isNaN(n) && n > 0) fids.add(n);
  }
  return fids;
}

export function isAllowlistEnforced(): boolean {
  return getAllowedFids().size > 0;
}

export function isFidAllowed(fid: number): boolean {
  if (!isAllowlistEnforced()) return true;
  return getAllowedFids().has(fid);
}

/** Mini app column viewer — only explicit ALLOWED_FIDS (empty env = no access). */
export function canUseMiniAppColumns(fid: number): boolean {
  const allowed = getAllowedFids();
  return allowed.size > 0 && allowed.has(fid);
}
