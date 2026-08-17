---
title: The client (the frontend)
description: Build and serve crimson-client, the React frontend, and understand how it bundles your sources at build time.
---

The client is the website your visitors see: search, catalogue, the player, accounts.
It's a React + Vite single-page app, served in production by a hardened Nginx image.

## The one thing to understand first

The client bundles **your private sources engine** as a git submodule at build time:

- `vendor/crimson-sources`: **your** private sources engine (the providers).

(The companion extension used to be vendored here too, but it now ships on the
[Chrome Web Store](/self-hosting/extension/#distributing-it-to-your-visitors). The
`/extension` page just links to the listing, so the client no longer bundles it.)

**It isn't required to build.** The client ships a **safeguard**: if
`vendor/crimson-sources` is absent (you don't have access, or there's no sources repo
yet), `vite.config.js` automatically swaps in a built-in no-op (`src/sourcesStub.js`)
and the build succeeds with **no client-side sources**, so playback simply falls back
to the backend.

So you have two perfectly valid setups:

1. **Sources present** (the full experience): point the submodule at your own private
   repo. See [Adding your own sources](/self-hosting/sources/).
2. **No sources**: a clean metadata + accounts site that builds out of the box.

## The API base URL is baked in at build time

The client talks to one backend, and that address is compiled into the bundle via a
**build argument**, `VITE_API_BASE_URL`. You set it when you build, not at runtime:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

If you change backends, you rebuild. (This is normal for static SPAs, because there's
no server to read an env var at request time.)

## Deployment-specific text (optional build args)

A couple of on-page strings that used to be hardcoded are now build arguments too, so
you can brand a fork without touching the source. Each has a placeholder default, so a
plain build still works unchanged, though you'll want to set both for anything public:

| Build arg | Controls | Default |
| --- | --- | --- |
| `VITE_HOSTED_IN` | Where user data lives, shown in the About page's "Queen's Decree", the footer pills, and the welcome tour. | `Secret:3` |
| `VITE_DMCA_MAIL` | The takedown / DMCA contact address on the Disclaimer page. | `NoEmailProvided` |

They're baked in **exactly like `VITE_API_BASE_URL`**, so set them at build time, not at
container runtime:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  --build-arg VITE_HOSTED_IN="🇩🇪 Germany" \
  --build-arg VITE_DMCA_MAIL=abuse@example.com \
  -t crimson-client:1.0 .
```

`VITE_HOSTED_IN` accepts a flag emoji too (e.g. `🇨🇭 Switzerland`). In CI they're read
from the repo's Actions **variables** `HOSTED_IN` and `DMCA_MAIL`; see
[The CI/CD pipeline](/deployment/cicd/). Leave them unset and the placeholders ship as
they are, which is fine for a private instance and obviously wrong for a public one.

## Social link previews (Open Graph) are per-environment

When someone drops your link in Discord, Twitter or Slack, the little preview card
comes from the **Open Graph / Twitter `<meta>` tags** in `index.html`, including
`og:image`, the card artwork. Those need **absolute** URLs, and the scrapers that read
them **don't run JavaScript**, so the correct origin has to be in the served HTML. You
can't fix it up at runtime with `window.location`.

So the origin is baked in at build time via `VITE_SITE_URL`, and every `__SITE_URL__`
token in `index.html` is replaced with it (see `vite.config.js`):

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  --build-arg VITE_SITE_URL=https://example.com \
  -t crimson-client:1.0 .
```

Set it to the **exact origin this build is served from** (no trailing slash), so your
dev image uses `https://dev.example.com` and prod uses `https://example.com`, and each
resolves its own card art. Unset, it falls back to the production origin. The reference
CI sets it automatically per branch/release (dev vs prod), alongside `VITE_API_BASE_URL`.

The card image itself lives in `public/` (e.g. `public/crimson_embed.png`), served at
the site root. Swap that file to rebrand the preview.

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
| `src/hooks/` | The cerebral cortex: API calls, stream handling, cryptographic session state. `src/hooks.js` is just the barrel that re-exports it. |
| `src/hooks/config.js` | The build-time constants (`VITE_API_BASE_URL`, `VITE_HOSTED_IN`, `VITE_DMCA_MAIL`). |
| `src/clientSources.js` | The bridge to your bundled sources engine + the `/scrape-meta`, `/sign`, `/resolve` grants. |
| `src/CrimsonPlayer.jsx` | The custom HLS/MP4 player. |
| `src/Account.jsx` | Mnemonic + email account flows. |
| `src/AnimeHub.jsx`, `src/ShowsHub.jsx`, `src/MoviesHub.jsx` | The browsing hubs, one per media kind. |
| `src/AnimeOverview.jsx`, `src/ShowOverview.jsx`, `src/MovieOverview.jsx` | The per-title pages. |
| `src/MangaHub.jsx`, `src/MangaReader.jsx` | The [reading surface](/self-hosting/manga/). |
| `src/LiveTvHub.jsx`, `src/LiveTvWatch.jsx` | The [Live TV surface](/self-hosting/live-tv/). |
| `src/LocalHub.jsx`, `src/LocalWatch.jsx` | The [local media library](/self-hosting/local-library/). |
| `src/Lumi.jsx` | The [chatbot](/self-hosting/lumi/) panel. |
| `src/admin/` | The admin dashboard screens (sources, users, security, Lumi). |
| `src/DownloadExtension.jsx` | The `/extension` page, which links to the companion's Chrome Web Store listing. |
| `security-headers.conf`, `nginx.conf` | The hardened serving config. |

## Client-side resolution, briefly

The client doesn't only consume the backend's `/watch` stream. It runs your sources
engine **in the browser** alongside it, and merges the results (a locally-resolved
stream supersedes a backend duplicate of the same source). This is off unless your
sources engine reports it can run something, so a stub or a no-companion visitor
cleanly falls back to the backend. The mechanics live in the
[New System](/architecture/new-system/).

### A required CSP note

For the in-browser player to load streams from rotating CDNs, the client ships a
Content-Security-Policy with `connect-src 'self' https:` (in `security-headers.conf`).
The strict `script-src 'self'` (the real XSS protection) is untouched; this only
widens where the page may *connect*, which client-side playback can't work without.

## Installable web app (PWA)

The client ships a web manifest + service worker, so browsers offer "Install app" /
"Add to Home Screen". The worker caches only the same-origin app shell, and never
touches the cross-origin backend API, so streaming, auth and progress behave normally.

:::tip[Lumi says]
Keep the client and backend on the **same registrable domain** (e.g.
`crimsonhaven.example.com` + `backend.crimsonhaven.example.com`). It keeps cookies,
CORS and CSP simple. The [Domains, TLS & Cloudflare](/deployment/domains/) page shows
the layout.
:::
