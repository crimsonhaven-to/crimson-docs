---
title: What is Crimson Haven?
description: What Crimson Haven is, what its repositories do, and the one thing the backend deliberately does NOT do.
---

Greetings, mortal. I am **Luminas Crimsonveil** (Lumi to my friends), your guide
through these archives. Before you build, here is what you are building.

## In one breath

Crimson Haven is a **self-hostable streaming website**. You run it on your own
server; your members log in and browse a catalogue with rich metadata, accounts,
favorites and watch-progress sync.

It is made of **five small projects**. You can stand up a working instance with just
the first two.

## The five projects

| Project | In plain words | Do I need it? |
| --- | --- | --- |
| **crimson-backend** | The brain. Serves metadata, runs accounts and the members-only login wall, and orchestrates everything. | **Yes** |
| **crimson-client** | The face. The website your visitors see and click (search, catalogue, player). | **Yes** |
| **crimson-proxy** | The edge. A free-tier relay (Netlify / Cloudflare) that carries video bytes so your own server doesn't have to. | Recommended |
| **crimson-extension** | The familiar. A small browser extension that gives visitors the most direct playback. | Optional |
| **your sources** | The secret. *Your own private repository* of stream providers. | For playback |

:::note
These docs cover the first four in detail. The fifth, **the sources**, is left to
you: the public projects ship with **no** streaming providers. [Adding your own
sources](/self-hosting/sources/) explains *how* to plug your private sources
repository in, without prescribing what goes in it.
:::

## The one thing the backend does NOT do

This is the core of the design:

> **The backend does not scrape or resolve third-party streaming sites.**

In older designs, the streaming server fetches every video itself, which is heavy,
slow and legally fraught. Crimson Haven is split so that the **backend stays the
brain** (metadata, identity, secrets, orchestration) while finding and fetching
streams happens **in each visitor's own browser**, helped by the optional companion
extension and the edge proxy.

What that means in practice:

- Your server's bandwidth cost scales with **how many titles and users** you have,
  not with **how many hours people watch**. Video bytes flow `CDN → viewer`, mostly
  skipping your server.
- The public repositories are safe to share, because they contain no scrapers.
- The stream providers live in **your** private repository, which only you control.
  See [Adding your own sources](/self-hosting/sources/).

The [New System](/architecture/new-system/) page lays out the four-tier execution
model behind this.

## What you'll need

- A server (a small VPS is enough to start).
- A free [TMDB](https://www.themoviedb.org/) API key (for metadata).
- Docker, or some comfort with the command line.

[Before you begin](/getting-started/before-you-begin/) walks through each. Onward,
into the castle. 🦇
