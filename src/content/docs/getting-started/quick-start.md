---
title: Quick start in 30 minutes
description: Get a Crimson Haven backend, database and frontend running on a single host with Docker, and open your own site.
---

This gets a working Haven running on **one** server with Docker, so you don't install
Python, PostgreSQL or Node by hand. At the end you log into your own instance and
browse the catalogue.

:::note[What "working" means here]
You get **metadata, search, accounts, favorites and the catalogue**. *Playback* needs
a sources module, which you add later; without one the client builds with a built-in
empty stub. See [Adding your own sources](/self-hosting/sources/).
:::

First complete the [Before you begin](/getting-started/before-you-begin/) checklist
(a host, Docker, and a TMDB key).

## Step 1: Bring up the backend and database

```bash
# Clone the brain
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-backend.git
cd crimson-backend

# Create your settings file from the template
cp .env.example .env
```

Open `.env` in a text editor and set these lines:

```ini
# Required: your free TMDB token from themoviedb.org
TMDB_API_KEY=paste_your_tmdb_token_here

# A secret used to sign things. Generate one with: openssl rand -hex 32
PROXY_SECRET=paste_a_long_random_hex_string_here

# Let yourself register an account (any code you like; you'll type it at signup)
SIGNUP_INVITE_CODE=let-me-in
```

Start it. This builds the image and also launches a bundled PostgreSQL database:

```bash
docker compose up -d
```

Wait about 30 seconds, then check it is alive:

```bash
curl http://localhost:8000/health
```

You should see a JSON object with `"status": "healthy"`. The interactive API docs are
at `http://localhost:8000/docs`. **The brain is awake.** 🧠

## Step 2: Clone the client (sources are optional)

```bash
cd ..
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-client.git
cd crimson-client
```

The client bundles a private **sources engine** for playback. Without one, the build
falls back to a no-op and the site runs with **no client-side sources**: metadata,
accounts and browsing all work, and playback waits until you add sources.

There is nothing to configure here.

:::tip[Lumi says]
Older guides had you hand-craft a stub file. You no longer need to: a fresh clone
builds even without access to any sources repository. Adding real playback later is
covered in [Adding your own sources](/self-hosting/sources/). ( ^ . ^ )
:::

## Step 3: Build and run the client

Point the client at the backend from Step 1 and launch it:

```bash
# 'localhost:8000' works for a local test. On a server, use your backend's address.
VITE_API_BASE_URL=http://localhost:8000 docker compose up --build -d
```

Once built, the site is served at `http://localhost:8080`. Check it:

```bash
curl http://localhost:8080/healthz   # -> ok
```

## Step 4: Open your Haven

Visit **`http://localhost:8080`** in your browser. You'll meet the login wall (the
site is members-only by default).

1. Choose to **create an account**.
2. When asked for an **invite code**, type the one you set (`let-me-in`).
3. The easiest account type is the **mnemonic** (a 12-word phrase): it needs no email
   and no mail server. **Write the 12 words down and keep them safe.** They *are* your
   account, and nobody can recover them for you.

You're in. Search a title, open it, browse seasons. 🩸

## Where to next

- **[First login & admin](/getting-started/first-login/)**: become an admin and tour
  the dashboard.
- **[Adding your own sources](/self-hosting/sources/)**: turn metadata-only into real
  playback.
- **[Single host (Docker Compose)](/deployment/single-host/)**: harden this setup for
  an always-on deployment with a domain.

:::caution
`http://localhost` is for testing only. A public site needs a domain and HTTPS; see
[Domains, TLS & Cloudflare](/deployment/domains/). Never expose the backend without
TLS in front of it.
:::
