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

**Neither is required to build.** The client ships a **safeguard**: if
`vendor/crimson-sources` is absent (you don't have access, or there's no sources repo
yet), `vite.config.js` automatically swaps in a built-in no-op (`src/sourcesStub.js`)
and the build succeeds with **no client-side sources** — playback simply falls back to
the backend. Likewise, a missing `vendor/crimson-extension` just means the `/extension`
download is unavailable; the build still completes.

So you have three perfectly valid setups:

1. **Both present** (the full experience) — point the submodules at your own private
   repos. See [Adding your own sources](/self-hosting/sources/).
2. **Sources only / extension only** — whichever you have access to.
3. **Neither** — a clean metadata + accounts site that builds out of the box.

## The API base URL is baked in at build time

The client talks to one backend, and that address is compiled into the bundle via a
**build argument**, `VITE_API_BASE_URL`. You set it when you build, not at runtime:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

If you change backends, you rebuild. (This is normal for static SPAs — there's no
server to read an env var at request time.)

## Deployment-specific text (optional build args)

A couple of on-page strings that used to be hardcoded are now build arguments too, so
you can brand a fork without touching the source. Each has a sensible default, so a
plain build still works unchanged:

| Build arg | Controls | Default |
| --- | --- | --- |
| `VITE_HOSTED_IN` | Where user data lives — shown in the About page's "Queen's Decree", the footer pills, and the welcome tour. | `Switzerland` |
| `VITE_DMCA_MAIL` | The takedown / DMCA contact address on the Disclaimer page. | `service@crimsonhaven.to` |

They're baked in **exactly like `VITE_API_BASE_URL`** — set them at build time, not at
container runtime:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  --build-arg VITE_HOSTED_IN="🇩🇪 Germany" \
  --build-arg VITE_DMCA_MAIL=abuse@example.com \
  -t crimson-client:1.0 .
```

`VITE_HOSTED_IN` accepts a flag emoji too (e.g. `🇨🇭 Switzerland`). In CI they're read
from the repo's Actions **variables** `HOSTED_IN` and `DMCA_MAIL` — see
[The CI/CD pipeline](/deployment/cicd/). Leave them unset to keep the defaults.

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
