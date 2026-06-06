import { mnemonicToAccount } from "viem/accounts";
import { neynar } from "@/lib/neynar";

const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: "Farcaster SignedKeyRequestValidator",
  version: "1",
  chainId: 10,
  verifyingContract: "0x00000000fc1237824fb747abde0ff18990e59b7e",
} as const;

const SIGNED_KEY_REQUEST_TYPES = {
  SignedKeyRequest: [
    { name: "requestFid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function getDeveloperAccount() {
  const mnemonic = process.env.FARCASTER_DEVELOPER_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not set");
  }
  return mnemonicToAccount(mnemonic);
}

function normalizePublicKeyHex(publicKey: string): `0x${string}` {
  const hex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  return `0x${hex}` as `0x${string}`;
}

/** Columns app FID (@columns) — from env or custody address lookup. */
export async function getAppFid(): Promise<number> {
  const envFid = process.env.FARCASTER_DEVELOPER_FID?.trim();
  if (envFid) {
    const fid = Number(envFid);
    if (!Number.isFinite(fid) || fid <= 0) {
      throw new Error("FARCASTER_DEVELOPER_FID is invalid");
    }
    return fid;
  }

  const account = getDeveloperAccount();
  const { user } = await neynar.lookupUserByCustodyAddress({
    custodyAddress: account.address,
  });
  if (!user?.fid) {
    throw new Error("No FID found for Columns app custody address");
  }
  return user.fid;
}

async function signKeyRequest(
  publicKey: string,
  appFid: number,
  deadline: number
): Promise<string> {
  const account = getDeveloperAccount();
  const keyHex = normalizePublicKeyHex(publicKey);

  return account.signTypedData({
    domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
    types: SIGNED_KEY_REQUEST_TYPES,
    primaryType: "SignedKeyRequest",
    message: {
      requestFid: BigInt(appFid),
      key: keyHex,
      deadline: BigInt(deadline),
    },
  });
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
