---
title: The client (the frontend)
description: Build and serve crimson-client, the React frontend, and how it bundles your sources at build time.
---

The client is the website your visitors see: search, the browse hubs, the player,
accounts. It is a React + Vite single-page app, served in production by an Nginx image
with security headers.

## Sources are bundled at build time

The client bundles **your private sources engine** as a git submodule at
`vendor/crimson-sources`.

The companion extension used to be vendored here too. It now ships on the
[Chrome Web Store](/self-hosting/extension/#distributing-it-to-your-visitors), and the
`/extension` page only links to the listing.

**The sources are not required to build.** If `vendor/crimson-sources` is absent (no
access, or no sources repo yet), `vite.config.js` swaps in a built-in no-op
(`src/sourcesStub.js`) and the build succeeds with **no client-side sources**. Playback
then falls back to the backend.

That gives two valid setups:

1. **Sources present** (the full experience): point the submodule at your own private
   repo. See [Adding your own sources](/self-hosting/sources/).
2. **No sources**: a metadata and accounts site that builds out of the box.

## The API base URL is baked in at build time

The client talks to one backend, and its address is compiled into the bundle via the
build argument `VITE_API_BASE_URL`. Set it when you build, not at runtime:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

Changing backends means rebuilding. A static SPA has no server to read an env var at
request time.

## Deployment-specific text (optional build args)

Two on-page strings are build arguments, so you can brand a fork without touching the
source. Both have defaults, so a plain build works unchanged:

| Build arg | Controls | Default |
| --- | --- | --- |
| `VITE_HOSTED_IN` | Where user data lives, shown in the About page's "Queen's Decree", the footer pills and the welcome tour. | `Switzerland` |
| `VITE_DMCA_MAIL` | The takedown / DMCA contact address on the Disclaimer page. | `service@crimsonhaven.to` |

They are baked in exactly like `VITE_API_BASE_URL`:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  --build-arg VITE_HOSTED_IN="🇩🇪 Germany" \
  --build-arg VITE_DMCA_MAIL=abuse@example.com \
  -t crimson-client:1.0 .
```

`VITE_HOSTED_IN` accepts a flag emoji (e.g. `🇨🇭 Switzerland`). In CI they come from
the GitLab CI/CD variables `HOSTED_IN` and `DMCA_MAIL` (see
[The CI/CD pipeline](/deployment/cicd/)). Leave them unset to keep the defaults.

## Social link previews (Open Graph) are per-environment

The preview card Discord, Twitter or Slack show for your link comes from the Open
Graph / Twitter `<meta>` tags in `index.html`, including `og:image`. Those need
**absolute** URLs, and the scrapers that read them don't run JavaScript, so the origin
must be in the served HTML. It cannot be fixed up at runtime with `window.location`.

The origin is baked in via `VITE_SITE_URL`, which replaces every `__SITE_URL__` token
in `index.html` (see `vite.config.js`):

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  --build-arg VITE_SITE_URL=https://example.com \
  -t crimson-client:1.0 .
```

Set it to the **exact origin this build is served from**, without a trailing slash:
`https://dev.example.com` for the dev image, `https://example.com` for prod. Unset, it
falls back to the production origin. The reference CI sets it per channel alongside
`VITE_API_BASE_URL`.

The card image lives in `public/` (e.g. `public/crimson_embed.png`) and is served at
the site root. Replace that file to rebrand the preview.

## Building and serving

### Local development

```bash
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-client.git
cd crimson-client
git submodule update --init --recursive   # optional: without access, the stub is used
npm install
npm run dev                                # Vite dev server
```

### Production (Docker)

The Dockerfile is multi-stage: Vite compiles the static bundle, then Nginx serves it
on port 80 with gzip, security headers, immutable hashed assets and a `/healthz`
probe.

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://backend.example.com \
  -t crimson-client:1.0 .
docker run -p 8080:80 crimson-client:1.0
curl http://localhost:8080/healthz        # -> ok
```

Or with the bundled Compose file, which publishes it on `8080`:

```bash
VITE_API_BASE_URL=https://backend.example.com docker compose up --build -d
```

## Where things live

| File | Role |
| --- | --- |
| `src/hooks.js` | API calls, stream handling, cryptographic session state. |
| `src/clientSources.js` | The bridge to your bundled sources engine and the `/scrape-meta`, `/sign`, `/resolve` grants. |
| `src/CrimsonPlayer.jsx` | The custom HLS/MP4 player. |
| `src/Account.jsx` | Mnemonic and email account flows. |
| `src/AccountSecurity.jsx` | Sessions, recent activity, data export and self-deletion, on the Account page. |
| `src/AiringCalendar.jsx`, `src/FollowButton.jsx` | The `/calendar` page and the follow bell beside the watchlist control. |
| `src/CrimsonWrapped.jsx` | The `/wrapped` year in review, from the account dropdown. |
| `src/AnimeHub.jsx`, `src/ShowsHub.jsx`, `src/MoviesHub.jsx` | The per-type browse hubs (`/catalogue` redirects to `/anime`). |
| `src/AnimeOverview.jsx`, `src/ShowOverview.jsx`, `src/MovieOverview.jsx` | Per-title pages. |
| `src/DownloadExtension.jsx` | The `/extension` page, linking to the companion's Chrome Web Store listing. |
| `security-headers.conf`, `nginx.conf` | The Nginx serving config. |

## Client-side resolution

The client does not only consume the backend's `/watch` stream. It also runs your
sources engine **in the browser** and merges the results, with a locally resolved
stream replacing a backend duplicate of the same source. This stays off unless your
engine reports it can run something, so a stub build or a visitor without the
companion falls back to the backend. The mechanics are in the
[New System](/architecture/new-system/).

### A required CSP note

For the in-browser player to load streams from rotating CDNs, the Content-Security-Policy
in `security-headers.conf` sets `connect-src 'self' https:`. The strict `script-src`
(the real XSS protection) is untouched: this only widens where the page may *connect*,
which client-side playback needs.

## Installable web app (PWA)

The client ships a web manifest and a service worker (`public/sw.js`), so browsers
offer "Install app" / "Add to Home Screen".

- The worker only handles **same-origin GET** requests. The backend API, auth,
  progress calls and the NDJSON stream live on another origin and go straight to the
  network.
- At build time the `swPrecache` plugin in `vite.config.js` writes the build's JS, CSS
  and font chunks into the worker, together with a build id. Every deploy installs a
  new worker that precaches all chunks, so lazy pages load offline even if they were
  never opened online.
- Navigations are network-first with the cached shell as offline fallback; other
  same-origin assets are stale-while-revalidate.
- Music a member downloads for offline use lives in separate `crimson-music-*` caches,
  which a worker update never deletes.

:::tip[Lumi says]
Keep the client and backend on the **same registrable domain** (e.g.
`crimsonhaven.example.com` and `backend.crimsonhaven.example.com`). It keeps cookies,
CORS and CSP simple. [Domains, TLS & Cloudflare](/deployment/domains/) shows the
layout.
:::
