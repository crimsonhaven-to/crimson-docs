---
title: The New System (E0–E3)
description: The four-tier execution model that lets Crimson Haven move scraping and video bytes off the backend and into the viewer's browser.
---

This model explains why the proxy exists, why the extension helps, and why some
sources need a "grant".

## The problem it solves

Fetching streams from gated CDNs runs into five constraints:

| # | Constraint | What it blocks |
| --- | --- | --- |
| **C1** | **CORS** | A page can't *read* a cross-origin response unless the server allows it. Most CDNs don't. |
| **C2** | **Forbidden headers** | A page can't set `Referer` / `Origin` / `User-Agent` / `Sec-Fetch-*` on its fetches. Many CDNs gate on exactly those. |
| **C3** | **TLS fingerprint (JA3)** | Anti-bot front-ends (Cloudflare) fingerprint the network stack. Servers get blocked; a real browser passes. |
| **C4** | **IP/ASN binding** | Some stream tokens are bound to the *network* that resolved them. A datacenter-minted token fails for a residential viewer. |
| **C5** | **Server-held secrets** | A few sources need a secret (a cookie, a token) that must never ship to a browser. |

A traditional backend avoids C1–C4 by doing everything server-side. That puts
**all video bytes** on the backend, which is the cost this design avoids.

## The insight

Two of the constraints **invert** when the work runs in the viewer's real browser:

- **C3 (JA3):** a real browser passes natively, so the advantage flips to the client.
- **C4 (ASN binding):** resolving in the viewer's browser mints the token for *their*
  IP, so it works.

C1 and C2 are the price, and either an **edge relay** (the proxy) or a **browser
extension** solves them. C5 is the only constraint that must stay server-side.

## The four execution environments

Work can run in four places. Each source is routed to the cheapest one that
satisfies its constraints:

```
   E3  ── Browser extension ── real browser + residential IP + header rewrite + CORS bypass
   E2  ── Edge proxy (CORS relay) ── header injection + CORS, but datacenter IP (no JA3/ASN)
   E1  ── Plain browser fetch ── real JA3 + residential IP, but bound by CORS + forbidden headers
   E0  ── Backend (fallback) ── the floor; runs operator-owned sources + holds secrets
```

| Tier | Where | Strengths | Limits |
| --- | --- | --- | --- |
| **E0** | Backend | Serve operator-owned sources (Local / Cache / Jellyfin), hold secrets. Anything the client cannot do falls back here, so nothing regresses below "the backend handles it". | Bytes flow through your server. |
| **E1** | Plain browser fetch | Real Chrome fingerprint and residential IP. | Get past CORS (C1) or forbidden headers (C2), so only CORS-friendly hosts work. |
| **E2** | Edge proxy | Inject headers and serve CORS-open, so it relays gated streams. | JA3-gated or ASN-bound sources: it is a datacenter IP with no Chrome fingerprint. |
| **E3** | Companion extension | Real browser, residential IP, rewrite forbidden headers, bypass CORS. Runs nearly every non-secret source end to end with neither backend nor proxy in the byte path. | Hold server secrets (C5). |

### The routing rule

> For each source, pick the **leftmost** environment in `[E3, E2, E1, E0]` whose
> capabilities meet the source's needs, always keeping **E0** as the floor.

A source declares what it needs via capability flags (`needsCORSBypass`,
`needsHeaderInjection`, `needsJA3`, `needsResidentialIP`, `needsServerSecret`,
`needsEdgeSecret`), and the engine's router places it.

## How "grants" fit in

Some steps need the backend even though the *bytes* do not flow through it. These
are small, login-gated **grant** endpoints:

| Grant | Does |
| --- | --- |
| **`/scrape-meta`** | Hands the client the title set (localized synonyms, release year, IMDb id) that only the server-held TMDB key can produce. |
| **`/sign`** | Mints a signed link to the edge proxy (E2). The proxy secret never reaches the browser. |
| **`/resolve`** | For a secret-bound source, does the secret part server-side and returns a raw stream URL the client then delivers itself. |

`/sign` and `/resolve` return `503` when not configured and the client falls back, so
a half-configured instance degrades instead of breaking.

## What this means for you, the self-hoster

- A visitor **with the extension** gets the best experience: most sources resolve and
  stream directly, and your backend carries almost nothing.
- A visitor **without the extension** but **with the proxy configured** still plays
  header-gated sources via E2.
- A visitor with **neither** gets whatever the backend can serve (your operator-owned
  sources) plus any CORS-friendly direct sources.

The proxy and the extension are **bandwidth and capability upgrades**, not
requirements. Start minimal and add them as your audience grows.

## Beyond video: the reading surface

The **manga** surface applies the same model to reading:

- Discovery and metadata stay on the backend (AniList: public metadata, no manga host).
- The chapter list and page images are resolved in the viewer's browser. MangaDex
  needs only a CORS bypass, so it routes E2/E3.
- Page images load as raw `<img>` URLs that never touch your server.
- The E0 floor is an *optional* private provider for devices that can run neither the
  extension nor the proxy.

See [The reading surface (manga)](/self-hosting/manga/).
