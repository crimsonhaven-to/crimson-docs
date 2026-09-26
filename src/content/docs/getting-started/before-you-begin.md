---
title: Before you begin
description: The checklist of everything you need before setting up a Crimson Haven instance, covering server, accounts, keys and tools.
---

No deep wizardry required, mortal. If you can copy, paste and edit a text file, you
can raise a Haven. This page is the checklist; the
[Quick start](/getting-started/quick-start/) does the actual setup.

## What you need

### 1. A server (a "host")

Anywhere you can run [Docker](https://www.docker.com/) works:

- A small **VPS** (e.g. a €5/month box with 1–2 GB RAM) is enough to begin.
- A spare PC, home server or NAS.
- Your own laptop, to try it locally.

You'll mostly work in a terminal. Every command you need is written out for you.

:::tip[Lumi says]
A VPS is *a computer that's always on, somewhere on the internet, that you rent*. Any
provider's smallest Linux box will do.
:::

### 2. A TMDB API key (free)

Crimson Haven gets its posters, titles and episode info from
[The Movie Database (TMDB)](https://www.themoviedb.org/). You need a free key:

1. Make an account at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings → API** and request an API key (choose "Developer"; any
   personal, non-commercial reason is fine).
3. Copy the **API Read Access Token** (the long one). That is your `TMDB_API_KEY`.

This is the **only** third-party key you need to get started.

### 3. Docker

Docker runs the whole stack without installing Python, PostgreSQL or Node by hand.
Install **Docker Engine and Docker Compose** for your system from the
[official guide](https://docs.docker.com/engine/install/). On a fresh Linux VPS:

```bash
curl -fsSL https://get.docker.com | sh
```

Confirm it works:

```bash
docker --version
docker compose version
```

### 4. A domain name (optional, for later)

To put your Haven on an address like `crimsonhaven.example.com` you need a domain and
a way to point it at your server. We recommend **Cloudflare** (free);
[Domains, TLS & Cloudflare](/deployment/domains/) covers it. Skip this while testing
locally.

## What you do NOT need yet

- ❌ A streaming-sources repository. You can log in and browse without one; add it
  when you're ready ([Adding your own sources](/self-hosting/sources/)).
- ❌ The CORS proxy or the companion extension. Both are upgrades you add later.
- ❌ Any paid service. Everything required is free.

## Where we're going

1. **[Quick start](/getting-started/quick-start/)**: get the backend, database and
   client running on one host and open the site.
2. **[First login & admin](/getting-started/first-login/)**: create your account,
   become an admin, and learn the dashboard.
3. From there, the [Self-Hosting Guide](/self-hosting/backend/) covers each piece in
   depth, and [Deployment](/deployment/single-host/) covers production.
