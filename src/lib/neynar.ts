import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

if (!process.env.NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY environment variable is not set");
}

const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
});

export const neynar = new NeynarAPIClient(config);
