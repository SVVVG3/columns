import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      // Farcaster CDN
      { protocol: "https", hostname: "imagedelivery.net" },
      { protocol: "https", hostname: "**.cloudflare.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Common OG image sources
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
