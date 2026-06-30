---
title: The client (the frontend)
description: Build and serve crimson-client — the React frontend — and understand how it bundles your sources and the companion extension at build time.
---

The client is the website your visitors see: search, catalogue, the player, accounts.
It's a React + Vite single-page app, served in production by a hardened Nginx image.

## The one thing to understand first

The client bundles two **git submodules** at build time:

- `vendor/crimson-sources` — **your** private sources engine (the providers).
- `vendor/crimson-extension` — the companion extension (so the site can offer it for
  download).

The build **imports the sources engine directly**, so it will fail if
`vendor/crimson-sources/src/index.ts` doesn't exist. You have two choices:

1. **Point the submodule at your own private sources repo** (the real setup) — see
   [Adding your own sources](/self-hosting/sources/).
2. **Use an empty stub** while you get everything else working — the
   [Quick start](/getting-started/quick-start/#step-2--give-the-client-an-empty-sources-stub)
   shows the exact placeholder file.

## The API base URL is baked in at build time

The client talks to one backend, and that address is compiled into the bundle via a
**build argument**, `VITE_API_BASE_URL`. You set it when you build, not at runtime:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

If you change backends, you rebuild. (This is normal for static SPAs — there's no
server to read an env var at request time.)

## Building & serving

### Local development

```bash
git clone https://github.com/crimsonhaven-to/crimson-client.git
cd crimson-client
git submodule update --init --recursive   # or create the stub (see Quick start)
npm install
npm run dev                                # Vite dev server
```

### Production (Docker)

The Dockerfile is multi-stage: Vite compiles the static bundle, then Nginx serves it
with gzip, security headers, immutable asset hashing, and a `/healthz` probe.

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  -t crimson-client:1.0 .
docker run -p 8080:8080 crimson-client:1.0
curl http://localhost:8080/healthz        # -> ok
```

Or with the bundled Compose file:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

## What's inside (a map)

| File | Role |
| --- | --- |
| `src/hooks.js` | The cerebral cortex — API calls, stream handling, cryptographic session state. |
| `src/clientSources.js` | The bridge to your bundled sources engine + the `/scrape-meta`, `/sign`, `/resolve` grants. |
| `src/CrimsonPlayer.jsx` | The custom HLS/MP4 player. |
| `src/Account.jsx` | Mnemonic + email account flows. |
| `src/Catalogue.jsx`, `src/AnimeOverview.jsx` | Browsing + per-title pages. |
| `src/DownloadExtension.jsx` | The `/extension` download page for the companion. |
| `security-headers.conf`, `nginx.conf` | The hardened serving config. |

## Client-side resolution, briefly

The client doesn't only consume the backend's `/watch` stream — it runs your sources
engine **in the browser** alongside it, and merges the results (a locally-resolved
stream supersedes a backend duplicate of the same source). This is off unless your
sources engine reports it can run something, so a stub or a no-companion visitor
cleanly falls back to the backend. The mechanics live in the
[New System](/architecture/new-system/).

### A required CSP note

For the in-browser player to load streams from rotating CDNs, the client ships a
Content-Security-Policy with `connect-src 'self' https:` (in `security-headers.conf`).
The strict `script-src 'self'` (the real XSS protection) is untouched — this only
widens where the page may *connect*, which client-side playback can't work without.

## Installable web app (PWA)

The client ships a web manifest + service worker, so browsers offer "Install app" /
"Add to Home Screen". The worker caches only the same-origin app shell — it never
touches the cross-origin backend API, so streaming, auth and progress behave normally.

:::tip[Lumi says]
Keep the client and backend on the **same registrable domain** (e.g.
`crimsonhaven.example.com` + `backend.crimsonhaven.example.com`). It keeps cookies,
CORS and CSP simple. The [Domains, TLS & Cloudflare](/deployment/domains/) page shows
the layout.
:::
