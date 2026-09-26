---
title: Single host (Docker Compose)
description: Turn the quick start into an always-on single-server deployment of Crimson Haven behind a reverse proxy with HTTPS.
---

The [Quick start](/getting-started/quick-start/) gets you running on `localhost`.
This page turns that setup into a public, always-on instance on **one server**, the
right size for most communities.

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

Two services you run (client and backend), one database, and a TLS-terminating
reverse proxy in front. Optionally the [proxy](/self-hosting/proxy/) (on free edge
hosting, not your server) and the [extension](/self-hosting/extension/) (in visitors'
browsers).

## Step 1: Pick your domains

You need two hostnames on a domain you control, e.g.:

- `crimson.example.com` → the client
- `backend.crimson.example.com` → the backend

Keeping them on the **same registrable domain** keeps cookies, CORS and CSP simple.
See [Domains, TLS & Cloudflare](/deployment/domains/) for DNS and TLS.

## Step 2: Run the backend

```bash
cd crimson-backend
# .env with at least: TMDB_API_KEY, DATABASE_URL (or POSTGRES_*),
# PROXY_SECRET, SIGNUP_INVITE_CODE, ADMIN_EMAILS, ALLOWED_ORIGINS
docker compose up -d
```

Set these production values in `.env`:

```ini
REQUIRE_LOGIN=true
ALLOWED_ORIGINS=https://crimson.example.com
PROXY_SECRET=<stable 32-byte hex, shared with the proxy if you run one>
```

:::caution[Reverse-proxy headers matter]
The backend builds absolute stream URLs from `X-Forwarded-Proto` and
`X-Forwarded-Host`. The Docker image runs uvicorn with `--proxy-headers
--forwarded-allow-ips "*"`, so it trusts those headers from any peer:

- Make sure your reverse proxy sets the `X-Forwarded-*` headers. Without
  `X-Forwarded-Proto: https`, stream URLs come out as `http://` and browsers block
  them as mixed content.
- Keep `:8000` reachable **only** through the reverse proxy. Direct access lets anyone
  spoof `X-Forwarded-Host`.
:::

## Step 3: Build and run the client

```bash
cd ../crimson-client
git submodule update --init --recursive    # optional: without sources, the stub is used
VITE_API_BASE_URL=https://backend.crimson.example.com docker compose up --build -d
```

## Step 4: Put a reverse proxy in front

Any of these works; **Caddy** is the simplest (automatic HTTPS):

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

Caddy fetches and renews Let's Encrypt certificates for you. For nginx or a
Cloudflare Tunnel, see [Domains, TLS & Cloudflare](/deployment/domains/).

## Step 5: First admin and invites

Follow [First login & admin](/getting-started/first-login/): set `ADMIN_EMAILS`,
register your admin account, then mint invites for your members.

## Keeping it healthy

| Task | How |
| --- | --- |
| **Updates** | `git pull` each repo, then `docker compose up -d --build`. Check out a release tag instead if you want stability over latest. |
| **Backups** | Back up PostgreSQL (see [The database](/self-hosting/database/)). It is the one thing you can't recreate. |
| **Logs** | `docker compose logs -f`. The backend's `/health` endpoint reports database status. |
| **Resources** | A 1–2 GB RAM box handles a small community, because video bytes don't flow through it. |

When one box isn't enough, move to the [Swarm deployment](/deployment/swarm/).
