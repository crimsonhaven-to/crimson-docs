---
title: Domains, TLS & Cloudflare
description: Point your domain at a Crimson Haven instance, get HTTPS, and lay out the client, backend and docs hostnames.
---

A public Haven needs a domain and HTTPS. This page covers the DNS and TLS layout that
keeps cookies, CORS and CSP simple.

## The recommended hostname layout

Put everything on one registrable domain:

| Hostname | Points at | Purpose |
| --- | --- | --- |
| `crimson.example.com` | client (`:8080`) | the website |
| `backend.crimson.example.com` | backend (`:8000`) | the API |
| `dev.crimson.example.com` / `dev-backend.…` | the dev stack | staging |
| `docs.crimson.example.com` | GitLab Pages | this documentation |

Same registrable domain means same-site cookies, easy CORS (`ALLOWED_ORIGINS`) and a
simple CSP.

## Option A: Cloudflare (recommended)

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
3. TLS is terminated at Cloudflare's edge, which sets `X-Forwarded-Proto` and
   `X-Forwarded-For`. The backend image already trusts forwarded headers (uvicorn runs
   with `--proxy-headers --forwarded-allow-ips "*"`), so it sees `https` and the real
   client IP.

## Option B: A reverse proxy with Let's Encrypt

To terminate TLS yourself, **Caddy** is the simplest (automatic certificates):

```text
# Caddyfile
crimson.example.com {
    reverse_proxy localhost:8080
}
backend.crimson.example.com {
    reverse_proxy localhost:8000
}
```

nginx with Certbot works too; make sure it sets `X-Forwarded-Proto` and
`X-Forwarded-Host` so the backend emits `https://` URLs.

## CORS, after you have domains

Tell the backend which origin the client lives on:

```ini
ALLOWED_ORIGINS=https://crimson.example.com
```

Unset, it falls back to the reference instance's origins (`https://crimsonhaven.to`
and `https://www.crimsonhaven.to`), which will not match your domain.

## The docs site (this very site)

The docs are an Astro + Starlight site published to **GitLab Pages**, separately from
your servers. The repo's `.gitlab-ci.yml` builds and deploys it on push to the default
branch.

1. In the `crimson-docs` project, open **Settings → Pages** and add your docs hostname
   as a custom domain.
2. Create the DNS records GitLab shows there (the hostname record plus a `TXT`
   verification record). With Cloudflare, keep the hostname record **DNS only / grey
   cloud** until the certificate is issued.
3. Enable automatic certificate management on that page, if your GitLab instance
   supports it, so HTTPS is provisioned once DNS resolves.

`public/CNAME` is left over from the GitHub Pages setup and has no effect on GitLab.

:::tip[Lumi says]
The proxy lives on **someone else's** edge (Netlify / Cloudflare Workers), so it has
its own `*.workers.dev` / `*.netlify.app` hostnames and you don't point your domain at
it. The backend only needs its URL in `CRIMSON_PROXY_BASE`.
:::

## A quick sanity checklist

- [ ] The client loads over HTTPS at its hostname.
- [ ] `https://backend.…/health` returns `"status": "healthy"`.
- [ ] `ALLOWED_ORIGINS` includes the client's HTTPS origin.
- [ ] The backend sees `X-Forwarded-Proto: https` (no mixed-content blocks on streams).
- [ ] `docs.…` serves the documentation.
