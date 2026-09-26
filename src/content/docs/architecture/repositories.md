---
title: The repositories
description: A reference map of every Crimson Haven repository, what it is built with, and how it connects to the others.
---

Crimson Haven is split across the repositories of the
[`crimsonhaven-to`](https://gitlab.ramon.moe/crimsonhaven-to) group. Four are public
and make up the stack. Three are private and optional: they hold the parts that find
streams or audio, and yours stay yours.

| Repository | Visibility | Role |
| --- | --- | --- |
| `crimson-backend` | public | Metadata, accounts, the login wall, grants |
| `crimson-client` | public | The website and the in-browser sources engine host |
| `crimson-proxy` | public | Signed edge relay for video bytes |
| `crimson-extension` | public | Browser companion for CORS unblock and header injection |
| your sources (`crimson-sources`) | private | Client-side stream providers, bundled into the client |
| your backend overlay (`crimson-backend-grants`) | private, optional | Server-side resolvers, scrapers and manga provider, baked into the backend image |
| your music provider (`crimson-music`) | private, optional | Where the music worker downloads audio from, baked into the backend image |

This documentation site lives in its own repository, `crimson-docs`.

## crimson-backend

- **What:** metadata, accounts, the login wall, grants, orchestration.
- **Stack:** Python 3.14, FastAPI, PostgreSQL (psycopg 3), APScheduler, Docker.
- **Talks to:** PostgreSQL (state), TMDB and AniList (metadata), the client (everything).
- **Does not:** scrape or resolve third-party streaming sites in the public image.
- **Guide:** [The backend](/self-hosting/backend/) · **Env:** [Backend environment](/reference/backend-env/)

## crimson-client

- **What:** the React single-page app your visitors use, and the host for the
  in-browser sources engine (bundled at build time).
- **Stack:** React 19, Vite, Tailwind CSS 4, served by hardened Nginx in production.
- **Talks to:** the backend (API), the extension and proxy (for resolving). Bundles
  your **sources** as the `vendor/crimson-sources` submodule. The companion extension
  is not bundled: it ships on the Chrome Web Store.
- **Guide:** [The client](/self-hosting/client/)

## crimson-proxy

- **What:** a signed, HLS-aware CORS relay that moves video segment bytes off your
  backend onto free edge hosting. It also holds certain *edge secrets* (e.g. a
  Jellyfin token) so even those bytes leave the backend.
- **Stack:** TypeScript, Nitro (deploys to Netlify Edge and/or Cloudflare Workers).
- **Talks to:** the backend's `/sign` grant (shared `PROXY_SECRET`), the client, CDNs.
- **Guide:** [The CORS proxy](/self-hosting/proxy/) · **Env:** [Proxy & edge secrets](/reference/proxy-env/)

## crimson-extension

- **What:** a small Chromium (MV3) companion that does **local CORS unblock and header
  injection**, so the in-browser engine can resolve gated sources and stream them
  straight from the CDN. One button, no build step.
- **Stack:** plain JavaScript (MV3 service worker and content scripts), no bundler.
- **Talks to:** the page (`window.CrimsonExtension` API) and any URL the page asks it
  to fetch. Holds **no secrets**.
- **Guide:** [The companion extension](/self-hosting/extension/)

## Your sources (private)

- **What:** *your* repository of stream providers, the only piece that knows how to
  find streams. The public stack deliberately ships none.
- **Stack:** TypeScript, exposing the engine contract the client imports
  (`createEngine`, `createMangaEngine`, `waitForExtensionBridge`, …).
- **Talks to:** the client (which bundles it), the extension and proxy (delivery),
  the backend grants.
- **Guide:** [Adding your own sources](/self-hosting/sources/)

## Your backend overlay (private, optional)

- **What:** Python modules copied into the backend's `resolvers/`, `scrapers/` and
  `manga_engine/` at image build time, for sources whose final step needs a
  server-held secret, and for the server-side manga provider.
- **Stack:** Python, laid out like the backend so the files copy straight across.
- **Used by:** the backend build, which clones it when the `SOURCES_REPO` CI/CD
  variable is set.
- **Guide:** [Backend-side E0 sources](/self-hosting/sources/#advanced-and-not-recommended-backend-side-e0-sources)

## Your music provider (private, optional)

- **What:** the source the backend's music worker downloads audio from. The public
  backend imports playlists, stores and plays the library, but never names a source.
- **Stack:** Python, plus its own `requirements.txt` installed at image build.
- **Used by:** the backend build, which clones it into `music_engine/` when the
  `MUSIC_REPO` CI/CD variable is set.
- **Guide:** [Music](/self-hosting/music/#the-music-provider)

## How they reference each other

```
crimson-client
  ├─ submodule → your sources           (vendor/crimson-sources)  ← private
  ├─ links to  → crimson-extension      (Chrome Web Store listing)
  └─ calls     → crimson-backend (API + grants)

crimson-backend
  ├─ bakes in  → your backend overlay   (SOURCES_REPO)  ← private, optional
  ├─ bakes in  → your music provider    (MUSIC_REPO)    ← private, optional
  └─ shares PROXY_SECRET with crimson-proxy (for the /sign grant)

crimson-proxy
  └─ verifies signatures minted by crimson-backend; may hold edge secrets
```

:::tip[Lumi says]
The submodule URL in the client is **relative** (`../crimson-sources`), so it resolves
to a sibling inside whatever group hosts the client. Keep all repos under one
group/owner and the wiring works in CI without changes.
:::

## Branches & environments

Every repo lives on a single **`main`** branch. For the deployed services, pushing to
`main` deploys to a staging stack and a **`v*` tag** deploys to production. The
[CI/CD pipeline](/deployment/cicd/) page covers this in detail.
