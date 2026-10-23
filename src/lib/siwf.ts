import { createAppClient, viemConnector } from "@farcaster/auth-client";
import { randomBytes } from "crypto";
import { getAppHostname, getAppUrl } from "@/lib/appUrl";

const appClient = createAppClient({
  ethereum: viemConnector({
    rpcUrl: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
  }),
});

export function createSiwfNonce(): string {
  return randomBytes(16).toString("hex");
}

export async function createSiwfChannel() {
  const nonce = createSiwfNonce();
  const domain = getAppHostname();
  const channel = await appClient.createChannel({
    siweUri: getAppUrl(),
    domain,
    nonce,
  });

  if (channel.isError) {
    throw new Error(channel.error?.message ?? "Could not start Farcaster sign-in");
  }

  return {
    channelToken: channel.data.channelToken,
    url: channel.data.url,
    nonce,
    domain,
  };
}

export async function readSiwfStatus(channelToken: string) {
  const status = await appClient.status({ channelToken });
  if (status.isError) {
    throw new Error(status.error?.message ?? "Farcaster sign-in status failed");
  }
  return status.data;
}

export async function verifySiwfMessage(input: {
  nonce: string;
  domain: string;
  message: string;
  signature: `0x${string}`;
  fid: number;
}): Promise<boolean> {
  const result = await appClient.verifySignInMessage({
    nonce: input.nonce,
    domain: input.domain,
    message: input.message,
    signature: input.signature,
  });
  if (result.isError || !result.success) return false;
  return result.fid === input.fid;
}
