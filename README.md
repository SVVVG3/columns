# Columns

A multi-column Farcaster client inspired by TweetDeck — home, trending, channels, users, and keyword feeds side by side in the browser. Built with Next.js and deployed on Vercel.

## Features

- Multiple customizable feed columns (drag to reorder)
- Sign in with Neynar (SIWN)
- Cast, reply, like, and recast
- Photo casts (up to 4 images) with client-side compression and Cloudflare R2 hosting
- Thread panel with conversation view
- URL, mini-app, video, token, and space embed previews

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Neynar](https://dev.neynar.com) API key and client ID (auth + writes)
- [Cloudflare R2](https://dash.cloudflare.com) bucket with public access (photo casts in production)

Reads (feeds, search, reactions) use [Hypersnap](https://github.com/farcasterorg/hypersnap) and do not require an API key by default.

## Local setup

```bash
git clone https://github.com/YOUR_USER/FarcasterDesktopClient.git
cd FarcasterDesktopClient
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` (see comments in the example file). Generate a session secret:

```bash
openssl rand -base64 32
```

Run the dev server:

```bash
npm run dev
```

Dev uses Webpack by default (more stable than Turbopack for this app). For Turbopack: `npm run dev:turbo` — if the app shows “Couldn’t refresh” everywhere, stop the server, run `rm -rf .next`, then `npm run dev` again.

Open [http://localhost:3000](http://localhost:3000).

Without R2 configured, photo uploads in development are saved under `public/cast-uploads/` (gitignored). Production requires all `R2_*` variables.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEYNAR_API_KEY` | Yes | Server-side Neynar API key |
| `NEXT_PUBLIC_NEYNAR_CLIENT_ID` | Yes | Neynar app client ID for sign-in |
| `SESSION_SECRET` | Yes | Min 32 chars; encrypts session cookie |
| `R2_ACCOUNT_ID` | Prod | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Prod | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Prod | R2 API token secret |
| `R2_BUCKET_NAME` | Prod | Bucket name |
| `R2_PUBLIC_BASE_URL` | Prod | Public bucket URL (no trailing slash) |
| `HYPERSNAP_URL` | No | Hypersnap node; defaults to public Quilibrium node |

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Add the environment variables above (use a **new** `SESSION_SECRET` for production).
4. In the Neynar developer portal, allow your Vercel production URL for SIWN if required.
5. Enable **Public Development URL** (or a custom domain) on your R2 bucket so cast image URLs are reachable.

Build command: `npm run build` (default). No extra Vercel config is required.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `npm run lint` | ESLint |

## Project structure

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # UI (feed columns, cast cards, layout, compose)
  hooks/         # React Query hooks
  lib/           # Hypersnap, Neynar, R2 uploads, feeds, session
  store/         # Zustand column layout state
  types/         # Shared TypeScript types
```

API routes under `src/app/api/` proxy Hypersnap reads and Neynar writes so secrets stay on the server.

## License

Private — all rights reserved unless otherwise specified by the repository owner.
