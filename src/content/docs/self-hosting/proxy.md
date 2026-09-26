---
title: The CORS proxy (the edge)
description: Deploy crimson-proxy to Netlify and/or Cloudflare so video bytes flow off your backend onto free edge hosting.
---

The proxy is an **optional but recommended** edge relay. It carries video segment
bytes for visitors without the companion extension, so those bytes flow
`CDN → edge → viewer` instead of through your backend. It deploys to free edge
hosting (Netlify Edge and/or Cloudflare Workers).

## Do I need it?

| | No-extension visitors get |
| --- | --- |
| **With the proxy** | Header-gated sources too (the E2 path), and your backend carries almost no video. |
| **Without it** | Only sources the backend owns plus CORS-friendly direct sources. Nothing breaks. |

Visitors *with* the extension skip the proxy entirely (E3, straight from the CDN).

## How it stays safe (not an open proxy)

Every request must carry an **HMAC signature** the backend mints with a shared secret
(`PROXY_SECRET` on the backend equals `NITRO_PROXY_SECRET` on the proxy). Unsigned or
forged links get `401`, so nobody can use your free-tier bandwidth as a general
proxy. The proxy is also HLS-aware (it rewrites playlists and re-signs
sub-resources), injects the per-stream headers gated CDNs need, and passes `Range`
requests through for seeking.

```
client resolves → backend /sign (tiny) → signed link → CDN → crimson-proxy → viewer
                       └─ shares PROXY_SECRET ───────────────────────┘
```

## Prerequisites

- A **Netlify** and/or **Cloudflare** account (both have free tiers).
- The same secret on both sides: pick `PROXY_SECRET` on the backend (e.g.
  `openssl rand -hex 32`) and set it as `NITRO_PROXY_SECRET` on each edge host.

The repo's GitLab pipeline deploys to both hosts on push to `main`. Each deploy job
skips itself when its token is absent, so you can run one host or both. Set the
variables below under *Settings → CI/CD → Variables*, masked.

## Deploy to Cloudflare Workers

1. In Cloudflare, create an API token (the **Edit Cloudflare Workers** template) and
   note your **Account ID**.
2. Add both as CI/CD variables: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Add a third variable, `NITRO_PROXY_SECRET` (the backend's `PROXY_SECRET`). The
   deploy job uploads it to the Worker as a secret on every deploy.
4. Push to `main`. For a manual deploy: `pnpm build:cloudflare && wrangler deploy`.

## Deploy to Netlify

Netlify's git integration won't connect a private group repo, so CI deploys with the
Netlify CLI instead:

1. Create a site once **without** linking git (`npx netlify-cli sites:create`) and
   note its **Site ID**.
2. Add the CI/CD variables `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
3. In the Netlify dashboard, set the runtime env var `NITRO_PROXY_SECRET` (the
   backend's `PROXY_SECRET`).
4. Push to `main`. The job runs `netlify deploy --prod` (an integrated build, so
   Nitro's edge function is bundled).

## Run both (recommended)

Deploy to both for free redundancy, then list both on the backend, comma-separated:

```ini
# In the backend .env:
CRIMSON_PROXY_BASE=https://your-site.netlify.app,https://crimson-proxy.your-acct.workers.dev
PROXY_SECRET=the-same-secret-both-edges-have
```

The signature covers the query fields and **not** the host, so one signed link is
valid on every edge. The backend load-balances per request and fails over to a
healthy host automatically.

## Edge-held secrets (advanced)

The proxy can also hold a secret the browser must never see and apply it on the byte
path. The reference example is **Jellyfin**: the edge logs into your Jellyfin server,
injects the token on each upstream fetch, and strips it from playlists so it is never
visible to the browser. This is configured with `NITRO_JELLYFIN_*` env vars on the
edge; see [Proxy & edge secrets](/reference/proxy-env/).

## Local development

```bash
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-proxy.git
cd crimson-proxy
pnpm install
cp .env.example .env        # leave NITRO_PROXY_SECRET blank for OPEN mode (local only!)
pnpm dev
curl 'http://localhost:3000/'   # health check
```

:::caution
A **blank** `NITRO_PROXY_SECRET` means *open mode*: no signature required. Fine on
your laptop, never in production. Set the secret on the host and signing is enforced
automatically.
:::
