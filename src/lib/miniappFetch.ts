import { sdk } from "@farcaster/miniapp-sdk";

/** Prefer Quick Auth fetch in mini app hosts; fall back to cookie session fetch. */
export async function miniappFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await sdk.quickAuth.fetch(input, init);
  } catch {
    return fetch(input, init);
  }
}
