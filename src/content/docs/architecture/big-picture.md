---
title: The big picture
description: How the Crimson Haven projects fit together, and the path of a single play request from click to pixels.
---

## The cast

```
                         ┌───────────────────────────────────────────┐
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
                         ┌───────────────┐       │   your private        │
                         │crimson-backend│       └── sources engine ──────┘
                         │  (the brain)  │            (bundled into the client)
                         └───────┬───────┘
                                 ▼
                         ┌──────────────┐
                         │  PostgreSQL  │
                         └──────────────┘
```

| Project | Role |
| --- | --- |
| **crimson-client** | The website. It also contains the in-browser scraping engine (your private sources), bundled at build time. |
| **crimson-backend** | Metadata, accounts, the login wall and small "grant" endpoints. Talks to PostgreSQL and scrapes nothing third-party. |
| **crimson-proxy** | Optional edge relay (Netlify / Cloudflare) that carries video bytes for visitors without the extension. |
| **crimson-extension** | Optional browser add-on that makes playback the fastest and most direct (CDN → viewer). |
| **your sources** | Your private repository of providers, consumed by the client. |

The optional private backend overlays are listed in [The repositories](/architecture/repositories/).

## The journey of one play

1. **The client asks the backend for metadata** (`/info`, `/seasons`, …) so it knows
   the title, season and episode, drawn from TMDB and AniList and served from PostgreSQL.
2. **The client starts the backend's `/watch` stream.** The backend returns only the
   sources *it* owns (your Local / Cache / Jellyfin, if configured). On a fresh
   install that is usually nothing.
3. **At the same time, the client's own engine resolves streams in the browser**
   with your private sources. Depending on the visitor's setup:
   - with the **extension**, it fetches gated CDNs directly (E3);
   - with the **proxy** configured, it asks the backend's `/sign` grant for a signed
     edge link (E2);
   - for sources needing a server-held secret, it asks the backend's `/resolve`
     grant, which does the secret part and hands back a raw URL.
4. **Both stream sources feed the same player.** Backend-owned and client-resolved
   streams appear as one deduplicated list. The fastest one plays first.
5. **Video bytes flow `CDN → viewer`** (or `CDN → edge → viewer` via the proxy),
   almost never through your backend.

**The backend orchestrates and authenticates, but stays out of the video path.** The
[New System](/architecture/new-system/) page explains this in depth.

## Why split it this way?

- **Cost.** Your server's bandwidth scales with *library + users*, not *watch-hours*.
- **Reliability.** Scraping from each visitor's residential connection avoids the
  blocks and rate limits a single datacenter IP would hit.
- **Shareability.** The public repositories contain no scrapers, so they are safe to
  open-source. The providers live only in your private sources repo.

## What stays on the backend (and why)

| Stays on the backend | Reason |
| --- | --- |
| Metadata + catalogue | Needs the TMDB key and a database; cheap, cacheable. |
| Accounts + login wall | Identity and secrets must be server-side. |
| The grants (`/sign`, `/resolve`, `/scrape-meta`) | They guard server-held secrets the browser must never see. |
| **Operator-owned** sources (Local / Cache / Jellyfin) | They serve *your own* media, not third-party scraping. |

Everything else moved into the browser. The [New System](/architecture/new-system/)
describes the tiered model that places each source.
