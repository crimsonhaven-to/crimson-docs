---
title: Domains, TLS & Cloudflare
description: Point your domain at a Crimson Haven instance, get HTTPS, and lay out the client/backend/docs hostnames cleanly.
---

A public Haven needs a domain and HTTPS. This page covers the DNS + TLS layout that
keeps cookies, CORS and CSP painless.

## The recommended hostname layout

Put everything on one registrable domain:

| Hostname | Points at | Purpose |
| --- | --- | --- |
| `crimson.example.com` | client (`:8080`) | the website |
| `backend.crimson.example.com` | backend (`:8000`) | the API |
| `dev.crimson.example.com` / `dev-backend.…` | the dev stack | staging |
| `docs.crimson.example.com` | GitHub Pages | this documentation |

Same registrable domain = same-site cookies, easy CORS (`ALLOWED_ORIGINS`), simple CSP.

## Option A — Cloudflare (recommended)

Cloudflare gives you free DNS, TLS and a tunnel that avoids opening ports.

1. Add your domain to Cloudflare and point your registrar at Cloudflare's nameservers.
2. **Cloudflare Tunnel** (no inbound ports): install `cloudflared` on your server,
   create a tunnel, and map public hostnames to local services:
   ```yaml
   # ~/.cloudflared/config.yml
   tunnel: <tunnel-id>
   ingress:
     - hostname: crimson.example.com
       service: http://localhost:8080
     - hostname: backend.crimson.example.com
       service: http://localhost:8000
     - service: http_status:404
   ```
   ```bash
   cloudflared tunnel run
   ```
3. TLS is terminated at Cloudflare's edge. Make sure the backend trusts the forwarded
   headers (`FORWARDED_ALLOW_IPS=*`) so it sees `https` and the real client IP.

## Option B — A reverse proxy with Let's Encrypt

If you'd rather terminate TLS yourself, **Caddy** is the simplest (automatic certs):

```caddy
crimson.example.com {
    reverse_proxy localhost:8080
}
backend.crimson.example.com {
    reverse_proxy localhost:8000
}
```

nginx + Certbot works too — just ensure it sets `X-Forwarded-Proto`/`X-Forwarded-Host`
so the backend emits `https://` URLs.

## CORS, after you have domains

Tell the backend which origin the client lives on:

```ini
ALLOWED_ORIGINS=https://crimson.example.com
```

Unset, it falls back to a built-in dev list — lock it down in production.

## The docs site (this very site)

`docs.example.com` is hosted on **GitHub Pages**, separately from your servers:

1. In the `crimson-docs` repo, `public/CNAME` already contains your docs hostname.
2. In **Settings → Pages**, set the source to **GitHub Actions** (the included
   workflow deploys on push to `main`).
3. Add a DNS record for the docs hostname:
   - With Cloudflare: a `CNAME` from `docs` → `<your-org>.github.io` (set to
     **DNS only / grey-cloud** initially while Pages provisions its certificate, then
     you may proxy it).
4. GitHub provisions an HTTPS certificate automatically once DNS resolves.

:::tip[Lumi says]
The proxy lives on **someone else's** edge (Netlify/Cloudflare Workers), so it has its
own `*.workers.dev` / `*.netlify.app` hostnames — you don't point your domain at it.
The backend just needs its URL in `CRIMSON_PROXY_BASE`.
:::

## A quick sanity checklist

- [ ] Client loads over HTTPS at its hostname.
- [ ] `https://backend.…/health` returns ok over HTTPS.
- [ ] `ALLOWED_ORIGINS` includes the client's HTTPS origin.
- [ ] The backend sees `X-Forwarded-Proto: https` (no mixed-content blocks on streams).
- [ ] `docs.…` serves the documentation.
