---
title: The CORS proxy (the edge)
description: Deploy crimson-proxy to Netlify and/or Cloudflare so video bytes flow off your backend onto free edge hosting.
---

The proxy is an **optional but recommended** edge relay. It carries video segment
bytes for visitors who don't have the companion extension, so those bytes flow
`CDN → edge → viewer` instead of through your backend. It deploys to free edge
hosting (Netlify Edge and/or Cloudflare Workers).

## Do I need it?

- **With it:** no-extension visitors can still play header-gated sources (the E2 path),
  and your backend carries almost no video.
- **Without it:** no-extension visitors only get sources the backend owns plus any
  CORS-friendly direct sources. Nothing breaks — it's a pure upgrade.

Visitors *with* the extension skip the proxy entirely (E3, straight from the CDN).

## How it stays safe (not an open proxy)

Every request the proxy serves must carry an **HMAC signature** the backend mints
with a shared secret (`PROXY_SECRET` on the backend == `NITRO_PROXY_SECRET` on the
proxy). Unsigned or forged links get `401`. So nobody can use your free-tier
bandwidth as a general-purpose proxy. It's also HLS-aware (rewrites playlists,
re-signing sub-resources), injects the per-stream headers gated CDNs need, and
passes through `Range` requests for seeking.

```
client resolves → backend /sign (tiny) → signed link → CDN → crimson-proxy → viewer
                       └─ shares PROXY_SECRET ───────────────────────┘
```

## Prerequisites

- A **Netlify** account and/or a **Cloudflare** account (both have free tiers).
- The same secret on both sides: pick `PROXY_SECRET` on the backend (e.g.
  `openssl rand -hex 32`) and set it as `NITRO_PROXY_SECRET` on each edge host.

## Deploy to Cloudflare Workers

1. In Cloudflare, create an API token (the **Edit Cloudflare Workers** template) and
   note your **Account ID**.
2. Add both as repository **Actions secrets**: `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
3. Add a third Actions secret `NITRO_PROXY_SECRET` (= the backend's `PROXY_SECRET`).
   The deploy workflow uploads it to the Worker on every deploy.
4. Push to `main` — the GitHub Action builds and deploys (and self-skips if the token
   is absent). For a manual deploy: `pnpm build:cloudflare && wrangler deploy`.

## Deploy to Netlify

Netlify's git integration won't connect a private org repo, so it deploys from CI via
the Netlify CLI instead:

1. Create a site once **without** linking git (`npx netlify-cli sites:create`) and
   note its **Site ID**.
2. Add repository Actions secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
3. In the Netlify dashboard, set the runtime env var `NITRO_PROXY_SECRET` (= the
   backend's `PROXY_SECRET`).
4. Push to `main`; the Action runs `netlify deploy --prod` (an integrated build, so
   Nitro's edge function is bundled).

## Run both (recommended)

Deploy to both for free redundancy, then tell the backend about both — comma-separated:

```ini
# In the backend .env:
CRIMSON_PROXY_BASE=https://your-site.netlify.app,https://crimson-proxy.your-acct.workers.dev
PROXY_SECRET=the-same-secret-both-edges-have
```

Because the signature covers the query fields and **not** the host, one signed link
is valid on every edge — so the backend load-balances per request and fails over to a
healthy host automatically.

## Edge-held secrets (advanced)

Beyond plain relaying, the proxy can hold a secret the browser must never see and
apply it on the byte path. The reference example is **Jellyfin**: the edge logs into
your Jellyfin server and injects the token on each upstream fetch, stripping it from
playlists so it's never browser-visible. That's configured with `NITRO_JELLYFIN_*`
env vars on the edge — see [Proxy & edge secrets](/reference/proxy-env/).

## Local development

```bash
git clone https://github.com/crimsonhaven-to/crimson-proxy.git
cd crimson-proxy
pnpm install
cp .env.example .env        # leave NITRO_PROXY_SECRET blank for OPEN mode (local only!)
pnpm dev
curl 'http://localhost:3000/'   # health check
```

:::caution
A **blank** `NITRO_PROXY_SECRET` means *open mode* — no signature required. Fine on
your laptop, never in production. Set the secret on the host and signing is enforced
automatically.
:::
