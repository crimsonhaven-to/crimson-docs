---
title: Single host (Docker Compose)
description: Turn the quick-start into a real, always-on single-server deployment of Crimson Haven behind a reverse proxy with HTTPS.
---

The [Quick start](/getting-started/quick-start/) gets you running on `localhost`.
This page hardens that same setup into a real, public, always-on instance on **one
server**, the right size for most communities.

## The shape of a single-host deployment

```
            Internet (HTTPS)
                  │
          ┌───────▼────────┐
          │ reverse proxy  │   (Caddy / nginx / Cloudflare Tunnel)
          │  + TLS certs   │
          └───┬────────┬───┘
   client.example.com  backend.example.com
              │            │
        ┌─────▼───┐   ┌────▼──────┐   ┌────────────┐
        │ client  │   │  backend  │──▶│ PostgreSQL │
        │ :8080   │   │  :8000    │   └────────────┘
        └─────────┘   └───────────┘
```

Two services you run (client + backend), one database, and a TLS-terminating reverse
proxy in front. Optionally the [proxy](/self-hosting/proxy/) (hosted on free edge,
not your server) and the [extension](/self-hosting/extension/) (in visitors' browsers).

## Step 1: pick your domains

You need two hostnames on a domain you control, e.g.:

- `crimson.example.com` → the client
- `backend.crimson.example.com` → the backend

Keeping them on the **same registrable domain** keeps cookies, CORS and CSP simple.
See [Domains, TLS & Cloudflare](/deployment/domains/) for DNS + TLS.

## Step 2: run the backend

```bash
cd crimson-backend
# .env with at least: TMDB_API_KEY, DATABASE_URL (or POSTGRES_*),
# PROXY_SECRET, SIGNUP_INVITE_CODE, ADMIN_EMAILS, ALLOWED_ORIGINS
docker compose up -d
```

Set these production-minded values in `.env`:

```ini
REQUIRE_LOGIN=true
ALLOWED_ORIGINS=https://crimson.example.com
PROXY_SECRET=<stable 32-byte hex, shared with the proxy if you run one>
FORWARDED_ALLOW_IPS=*          # trust the reverse proxy's forwarded headers
```

:::caution[Reverse-proxy headers matter]
The backend emits absolute stream URLs. Behind TLS termination it must see
`X-Forwarded-Proto: https` (uvicorn runs with `--proxy-headers`), or those URLs come
out as `http://` and browsers block them as mixed content. Make sure your reverse
proxy sets the `X-Forwarded-*` headers.
:::

## Step 3: build & run the client

```bash
cd ../crimson-client
git submodule update --init --recursive    # or your sources stub
VITE_API_BASE_URL=https://backend.crimson.example.com docker compose up --build -d
```

## Step 4: put a reverse proxy in front

Any of these works; **Caddy** is the gentlest (automatic HTTPS):

```text
# Caddyfile
crimson.example.com {
    reverse_proxy localhost:8080
}
backend.crimson.example.com {
    reverse_proxy localhost:8000
}
```

```bash
caddy run --config ./Caddyfile
```

Caddy fetches and renews Let's Encrypt certificates for you. Prefer nginx or a
Cloudflare Tunnel? Both are covered in [Domains, TLS & Cloudflare](/deployment/domains/).

## Step 5: first admin + invites

Follow [First login & admin](/getting-started/first-login/): set `ADMIN_EMAILS`,
register your admin account, then mint invites for your members.

## Keeping it healthy

- **Updates:** `git pull` each repo, then re-run `docker compose up -d --build`.
  Pin to release tags if you want stability over latest.
- **Backups:** back up PostgreSQL (see [The database](/self-hosting/database/)). This
  is the one thing you can't recreate.
- **Logs:** `docker compose logs -f`. The backend's `/health` endpoint reports DB
  status.
- **Resources:** a 1 to 2 GB RAM box handles a small community comfortably, because video
  bytes don't flow through it.

When one box isn't enough, graduate to the [Swarm deployment](/deployment/swarm/).
