---
title: The five repositories
description: A reference map of every Crimson Haven repository, covering what it is, what it's built with, and how it connects to the others.
---

Crimson Haven is split across five repositories under the
[`crimsonhaven-to`](https://github.com/crimsonhaven-to) organisation. Four are
public; the fifth, your sources, is private and yours.

## crimson-backend

- **What:** the brain. Metadata, accounts, the login wall, grants, orchestration.
- **Stack:** Python 3.10+ / FastAPI, PostgreSQL (psycopg 3), APScheduler, Docker.
- **Talks to:** PostgreSQL (state), TMDB + AniList (metadata), the client (everything).
- **Notably does NOT:** scrape or resolve third-party streaming sites.
- **Guide:** [The backend](/self-hosting/backend/) · **Env:** [Backend environment](/reference/backend-env/)

## crimson-client

- **What:** the face. The React single-page app your visitors use, *and* the host
  for the in-browser sources engine (bundled at build time).
- **Stack:** React 19, Vite, Tailwind CSS 4, served by hardened Nginx in production.
- **Talks to:** the backend (API), the extension + proxy (for resolving), and bundles
  your **sources** engine. (The companion extension is no longer bundled, since it
  ships on the Chrome Web Store.)
- **Guide:** [The client](/self-hosting/client/)

## crimson-proxy

- **What:** the edge. A signed, HLS-aware CORS relay that carries video segment
  bytes off your backend onto free edge hosting. Also holds certain *edge secrets*
  (e.g. a Jellyfin token) so even those bytes leave the backend.
- **Stack:** TypeScript, Nitro (deploys to Netlify Edge and/or Cloudflare Workers).
- **Talks to:** the backend's `/sign` grant (shared `PROXY_SECRET`), the client, CDNs.
- **Guide:** [The CORS proxy](/self-hosting/proxy/) · **Env:** [Proxy & edge secrets](/reference/proxy-env/)

## crimson-extension

- **What:** the familiar. A tiny Chromium (MV3) companion that does **local CORS
  unblock + header injection** so the in-browser engine can resolve gated sources
  and stream them straight from the CDN. One button; no build step.
- **Stack:** plain JavaScript (MV3 service worker + content scripts). No bundler.
- **Talks to:** the page (`window.CrimsonExtension` API), and any URL the page asks
  it to fetch. Holds **no secrets**.
- **Guide:** [The companion extension](/self-hosting/extension/)

## your sources (private)

- **What:** *your* repository of stream providers, the only piece that actually
  knows how to find streams. The public stack deliberately ships none.
- **Stack:** TypeScript, exposing the engine contract the client imports
  (`createEngine`, `waitForExtensionBridge`, …).
- **Talks to:** the client (which bundles it at `vendor/crimson-sources`),
  the extension + proxy (delivery), the backend grants.
- **Guide:** [Adding your own sources](/self-hosting/sources/)

## How they reference each other

```
crimson-client
  ├─ bundles   → your sources           (vendor/crimson-sources)  ← private
  ├─ links to  → crimson-extension      (Chrome Web Store listing)
  └─ calls     → crimson-backend (API + grants)

crimson-backend
  └─ shares PROXY_SECRET with crimson-proxy (for the /sign grant)

crimson-proxy
  └─ verifies signatures minted by crimson-backend; may hold edge secrets
```

:::tip[Lumi says]
Locally, the client pulls the sources engine in as a git submodule with a
**relative** URL (`../crimson-sources`), so it resolves to a sibling inside whatever
organisation hosts the client. In CI the engine is cloned at its branch tip from the
repo named by the `CRIMSON_SOURCES_REPO` secret instead, so a build always bundles
the freshest engine. Keep all repos under one org/owner and both paths line up.
:::

## Branches & environments

The backend and client use a **`dev`** branch (a staging environment) and a
**`main`** branch (production). Pushing to `dev` auto-deploys to a staging stack;
a tagged release on `main` deploys to production. The [CI/CD pipeline](/deployment/cicd/)
page covers this in detail.
