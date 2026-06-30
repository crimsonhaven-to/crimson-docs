---
title: Before you begin
description: The plain-language checklist of everything you need before setting up a Crimson Haven instance — server, accounts, keys and tools.
---

No deep wizardry required, mortal. If you can copy, paste, and edit a text file,
you can raise a Haven. This page is the gentle checklist; the
[Quick start](/getting-started/quick-start/) is the actual ritual.

## What you need

### 1. A server (a "host")

Anywhere you can run [Docker](https://www.docker.com/) works:

- A small **VPS** (e.g. a €5/month box with 1–2 GB RAM) is plenty to begin.
- A spare PC or home server / NAS works too.
- Even your own laptop, just to try it locally.

You'll mostly interact with it through a terminal (the black window where you type
commands). Don't be afraid of it — every command you need is written out for you.

:::tip[Lumi says]
If "VPS" means nothing to you, that's fine. It's just *a computer that's always on,
somewhere on the internet, that you rent*. Any provider's smallest Linux box will do.
:::

### 2. A TMDB API key (free)

Crimson Haven gets all its posters, titles and episode info from
[The Movie Database (TMDB)](https://www.themoviedb.org/). You need a free key:

1. Make an account at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings → API** and request an API key (choose "Developer"; any
   personal/non-commercial reason is fine).
3. Copy the **API Read Access Token** (the long one). That's your `TMDB_API_KEY`.

This is the **only** key you strictly need to get started.

### 3. Docker (the easy installer)

Docker lets you run the whole stack without installing Python, databases, or
Node by hand. Install **Docker Engine + Docker Compose** for your system from the
[official guide](https://docs.docker.com/engine/install/). On a fresh Linux VPS:

```bash
curl -fsSL https://get.docker.com | sh
```

Confirm it works:

```bash
docker --version
docker compose version
```

### 4. (Optional, for later) A domain name

To put your Haven on a real address like `crimsonhaven.example.com` you'll want a
domain and a way to point it at your server. We recommend **Cloudflare** (free) —
the [Domains, TLS & Cloudflare](/deployment/domains/) page covers it. You can skip
this entirely while testing locally.

## What you do NOT need yet

- ❌ A streaming-sources repository — you can log in and browse without one. Add it
  when you're ready ([Adding your own sources](/self-hosting/sources/)).
- ❌ The CORS proxy or the companion extension — both are upgrades you bolt on later.
- ❌ Any paid service. Everything required is free.

## A map of where we're going

1. **[Quick start](/getting-started/quick-start/)** — get the backend + database +
   client running on one host and open the site.
2. **[First login & admin](/getting-started/first-login/)** — create your account,
   become an admin, and learn the dashboard.
3. From there, branch into the [Self-Hosting Guide](/self-hosting/backend/) for each
   piece in depth, or jump to [Deployment](/deployment/single-host/) for production.

Take a breath. Pour something warm. Let's begin.
