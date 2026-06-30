---
title: The big picture
description: How the five Crimson Haven projects fit together, and the journey of a single play request from click to pixels.
---

Before you wire things together, it helps to see the whole castle from above.

## The cast

```
                         ┌──────────────────────────────────────────┐
                         │            crimson-client (SPA)           │
   visitor's browser ◀──▶│   the website + the in-browser engine     │
                         └───────┬───────────────┬───────────────────┘
                                 │               │
                  metadata,      │               │  resolves streams using…
                  accounts,      │               │
                  grants         │               ▼
                                 │      ┌──────────────────┐   ┌───────────────────┐
                                 │      │ crimson-extension│   │   crimson-proxy   │
                                 │      │  (E3, in browser)│   │   (E2, edge CDN)  │
                                 │      └──────────────────┘   └───────────────────┘
                                 ▼               │                       │
                         ┌──────────────┐        │   your private        │
                         │crimson-backend│       └── sources engine ──────┘
                         │  (the brain)  │            (bundled into the client)
                         └───────┬───────┘
                                 ▼
                         ┌──────────────┐
                         │  PostgreSQL  │
                         └──────────────┘
```

- **crimson-client** — the website. It also *contains* the in-browser scraping
  engine (your private sources), bundled at build time.
- **crimson-backend** — the brain. Metadata, accounts, the login wall, and small
  "grant" endpoints. It talks to PostgreSQL and scrapes nothing third-party.
- **crimson-proxy** — an optional edge relay (Netlify / Cloudflare) that carries
  video bytes for visitors who don't have the extension.
- **crimson-extension** — an optional browser add-on that makes playback the
  fastest and most direct (CDN → viewer).
- **your sources** — your private repository of providers, consumed by the client.

## The journey of one play

When a visitor clicks **play**, here's what happens:

1. **The client asks the backend for metadata** (`/info`, `/seasons`, …) so it knows
   the title, season and episode — drawn from TMDB + AniList, served from PostgreSQL.
2. **The client starts the backend's `/watch` stream.** The backend returns only the
   sources *it* owns (your Local / Cache / Jellyfin, if configured) — usually nothing
   on a fresh install.
3. **At the same time, the client's own engine resolves streams in the browser.** It
   uses your private sources, and depending on the visitor's setup:
   - with the **extension** → it fetches gated CDNs directly (E3),
   - with the **proxy** configured → it asks the backend's `/sign` grant for a signed
     edge link (E2),
   - for sources needing a server-held secret → it asks the backend's `/resolve`
     grant, which does the secret part and hands back a raw URL.
4. **Both stream sources feed the same player.** Backend-owned and client-resolved
   streams appear as one deduplicated list. The fastest one plays first.
5. **Video bytes flow `CDN → viewer`** (or `CDN → edge → viewer` via the proxy),
   almost never through your backend.

The crucial idea: **the backend orchestrates and authenticates, but stays out of the
video path.** That's what the [New System](/architecture/new-system/) page explains
in depth.

## Why split it this way?

- **Cost.** Your server's bandwidth scales with *library + users*, not *watch-hours*.
- **Reliability.** Scraping from each visitor's residential connection dodges the
  blocks and rate-limits a single datacenter IP would hit.
- **Shareability.** The public repositories contain no scrapers, so they're safe to
  open-source; the providers live only in your private sources repo.

## What stays on the backend (and why)

| Stays on the backend | Reason |
| --- | --- |
| Metadata + catalogue | Needs the TMDB key and a database; cheap, cacheable. |
| Accounts + login wall | Identity and secrets must be server-side. |
| The grants (`/sign`, `/resolve`, `/scrape-meta`) | They guard server-held secrets the browser must never see. |
| **Operator-owned** sources (Local / Cache / Jellyfin) | They serve *your own* media — not third-party scraping. |

Everything else moved into the browser. Read on for the tiered model that makes
each source land in the right place.
