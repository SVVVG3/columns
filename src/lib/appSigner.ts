import { ViemLocalEip712Signer } from "@farcaster/hub-nodejs";
import { bytesToHex, hexToBytes } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { neynar } from "@/lib/neynar";

function normalizeMnemonic(raw: string): string {
  let mnemonic = raw.trim();
  if (
    (mnemonic.startsWith('"') && mnemonic.endsWith('"')) ||
    (mnemonic.startsWith("'") && mnemonic.endsWith("'"))
  ) {
    mnemonic = mnemonic.slice(1, -1).trim();
  }
  return mnemonic.replace(/\s+/g, " ");
}

function getDeveloperAccount() {
  const raw = process.env.FARCASTER_DEVELOPER_MNEMONIC;
  if (!raw?.trim()) {
    throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not set");
  }
  return mnemonicToAccount(normalizeMnemonic(raw));
}

function normalizePublicKeyHex(publicKey: string): `0x${string}` {
  const hex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return `0x${hex}` as `0x${string}`;
}

/** Columns app FID (@columns) — validates mnemonic custody matches env FID. */
export async function getAppFid(): Promise<number> {
  const account = getDeveloperAccount();
  const { user } = await neynar.lookupUserByCustodyAddress({
    custodyAddress: account.address,
  });

  if (!user?.fid) {
    throw new Error(
      `No Farcaster account for custody address ${account.address}. Check FARCASTER_DEVELOPER_MNEMONIC.`
    );
  }

  const envFid = process.env.FARCASTER_DEVELOPER_FID?.trim();
  if (envFid) {
    const expected = Number(envFid);
    if (!Number.isFinite(expected) || expected <= 0) {
      throw new Error("FARCASTER_DEVELOPER_FID is invalid");
    }
    if (user.fid !== expected) {
      throw new Error(
        `FARCASTER_DEVELOPER_FID (${expected}) does not match mnemonic custody FID (${user.fid}).`
      );
    }
  }

  return user.fid;
}

async function signKeyRequest(
  publicKey: string,
  appFid: number,
  deadline: number
): Promise<string> {
  const account = getDeveloperAccount();
  const signer = new ViemLocalEip712Signer(account);
  const keyBytes = hexToBytes(normalizePublicKeyHex(publicKey));

  const result = await signer.signKeyRequest({
    requestFid: BigInt(appFid),
    key: keyBytes,
    deadline: BigInt(deadline),
  });

  if (result.isErr()) {
    throw new Error(`Failed to sign key request: ${result.error.message}`);
  }

  return bytesToHex(result.value);
}

/** Create a Neynar signer registered under Columns' app FID (sent-from attribution). */
export async function createAndRegisterAppSigner() {
  const created = await neynar.createSigner();
  const appFid = await getAppFid();
  const deadline = Math.floor(Date.now() / 1000) + 86_400;

  const signature = await signKeyRequest(created.public_key, appFid, deadline);

  return neynar.registerSignedKey({
    signerUuid: created.signer_uuid,
    appFid,
    deadline,
    signature,
    sponsor: { sponsored_by_neynar: true },
  });
}
