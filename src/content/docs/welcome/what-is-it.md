---
title: What is Crimson Haven?
description: A plain-language explanation of what Crimson Haven is, what the five repositories do, and the one important thing the backend deliberately does NOT do.
---

Greetings, mortal. I am **Luminas Crimsonveil** — Lumi to my friends — and I'll be
your guide through these archives. Before you build, let me tell you plainly what
it is you're building.

## In one breath

Crimson Haven is a **self-hostable streaming website**. You run it on your own
server; your members log in and browse a beautiful catalogue of titles with rich
metadata, accounts, favorites and watch-progress sync.

It is made of **five small projects** that work together. None of them is
enormous, and you can stand up a working instance with just the first three.

## The five projects

| Project | In plain words | Do I need it? |
| --- | --- | --- |
| **crimson-backend** | The brain. Serves metadata, runs accounts + the members-only login wall, and orchestrates everything. | **Yes** |
| **crimson-client** | The face. The website your visitors see and click (search, catalogue, player). | **Yes** |
| **crimson-proxy** | The edge. A free-tier relay (Netlify / Cloudflare) that carries heavy video bytes so your own server doesn't have to. | Recommended |
| **crimson-extension** | The familiar. A tiny browser add-on that gives your visitors the smoothest, most direct playback. | Optional |
| **your sources** | The secret. *Your own private repository* of stream providers. | For playback |

:::note
This documentation covers four of the five in great detail. The fifth — **the
sources** — is intentionally left to you: the public projects ship with **no**
streaming providers at all. The [Adding your own sources](/self-hosting/sources/)
page explains *how* to plug your own private sources repository in, without
prescribing what goes in it.
:::

## The one important thing the backend does NOT do

This is the heart of the design, so read it twice:

> **The backend does not scrape or resolve third-party streaming sites.**

In older designs, a streaming server fetches every video itself — which is heavy,
slow, and legally fraught. Crimson Haven was deliberately split so that the
**backend stays the brain** (metadata, identity, secrets, orchestration) while the
actual finding-and-fetching of streams happens **in each visitor's own browser**
(helped by the optional companion extension and the edge proxy).

The practical upshots:

- Your server's bandwidth cost scales with **how many titles + users** you have,
  not with **how many hours people watch**. Video bytes flow `CDN → viewer`,
  skipping your server almost entirely.
- The public repositories are safe to share, because they contain no scrapers.
- The actual stream providers live in **your** private repository that only you
  control — see [Adding your own sources](/self-hosting/sources/).

If you want the full reasoning, the [New System](/architecture/new-system/) page
lays out the four-tier execution model that makes this work.

## What you'll need (the short version)

- A server (a small VPS is plenty to start).
- A free [TMDB](https://www.themoviedb.org/) API key (for metadata).
- Docker, or a little comfort with the command line.

The next page, [Before you begin](/getting-started/before-you-begin/), walks
through all of it gently. Onward, into the castle. 🦇
