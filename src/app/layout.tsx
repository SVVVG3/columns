import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://mycolumns.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Columns",
  description: "Multi-Column Farcaster Desktop Client",
  // Tab icon: src/app/icon.png and apple-icon.png (Next.js file convention)
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
  // Share preview: src/app/opengraph-image.png + twitter-image.png
  openGraph: {
    title: "Columns",
    description: "Multi-Column Farcaster Desktop Client",
    siteName: "Columns",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Columns" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Columns",
    description: "Multi-Column Farcaster Desktop Client",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
