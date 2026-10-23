/** Unfinished cast text, kept in this browser only. Photos are not included. */

const PREFIX = "columns:cast-draft:v1";

export function castDraftStorageKey(input: {
  fid?: number;
  parentHash?: string;
  quoteHash?: string;
}): string {
  const owner = input.fid && input.fid > 0 ? String(input.fid) : "anon";
  if (input.parentHash) return `${PREFIX}:${owner}:reply:${input.parentHash}`;
  if (input.quoteHash) return `${PREFIX}:${owner}:quote:${input.quoteHash}`;
  return `${PREFIX}:${owner}:new`;
}

export function readCastDraft(storage: Storage, key: string): string {
  try {
    return storage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Empty text removes the draft so a cleared composer stays cleared. */
export function writeCastDraft(storage: Storage, key: string, text: string): void {
  try {
    if (!text.trim()) storage.removeItem(key);
    else storage.setItem(key, text);
  } catch {
    // Private mode or a full disk should not block composing.
  }
}

export function deleteCastDraft(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}
