---
title: The New System (E0–E3)
description: The four-tier execution model that lets Crimson Haven move scraping and video bytes off the backend and into the viewer's browser.
---

This is the design philosophy behind the whole project. Understanding it makes
every later decision (why the proxy exists, why the extension helps, why some
sources need a "grant") obvious.

## The problem it solves

A browser is a hostile place to fetch streams from gated CDNs, for four reasons:

| # | Constraint | What it blocks |
| --- | --- | --- |
| **C1** | **CORS** | A page can't *read* a cross-origin response unless the server allows it. Most CDNs don't. |
| **C2** | **Forbidden headers** | A page can't set `Referer` / `Origin` / `User-Agent` / `Sec-Fetch-*` on its fetches. Many CDNs gate on exactly those. |
| **C3** | **TLS fingerprint (JA3)** | Anti-bot front-ends (Cloudflare) fingerprint the network stack. Servers get blocked; a real browser passes. |
| **C4** | **IP/ASN binding** | Some stream tokens are bound to the *network* that resolved them. A datacenter-minted token fails for a residential viewer. |
| **C5** | **Server-held secrets** | A few sources need a secret (a cookie, a token) that must never ship to a browser. |

A traditional backend dodges C1–C4 by doing everything server-side. But that puts
**all video bytes** on the backend — the exact cost we want to avoid.

## The insight

Two of the nastiest constraints **invert** when you run in the viewer's real browser:

- **C3 (JA3)** — a real browser passes natively. The advantage flips to the client.
- **C4 (ASN binding)** — resolving in the viewer's browser mints the token for *their*
  IP, so it just works.

C1 and C2 are the price — and they're solved by either an **edge relay** (the proxy)
or a **browser extension**. C5 is the only thing that genuinely must stay server-side.

## The four execution environments

So we define four places work can run, and route each source to the cheapest one
that can satisfy its constraints:

```
   E3  ── Browser extension ── real browser + residential IP + header rewrite + CORS bypass
   E2  ── Edge proxy (CORS relay) ── header injection + CORS, but datacenter IP (no JA3/ASN)
   E1  ── Plain browser fetch ── real JA3 + residential IP, but bound by CORS + forbidden headers
   E0  ── Backend (fallback) ── the floor; runs operator-owned sources + holds secrets
```

- **E0 — Backend.** The floor. Serves operator-owned sources (Local / Cache /
  Jellyfin) and holds secrets. Anything the client can't do falls back here, so
  nothing ever regresses below "the backend handles it."
- **E1 — Plain browser fetch.** Real Chrome fingerprint and residential IP, but
  bound by CORS (C1) and forbidden headers (C2). Useful only for CORS-friendly hosts.
- **E2 — The edge proxy.** Injects headers and is CORS-open, so it relays gated
  streams — but it's a datacenter IP with no Chrome fingerprint, so it **can't** do
  JA3-gated or ASN-bound sources.
- **E3 — The companion extension.** The superpower: a real browser, residential IP,
  *and* it can rewrite forbidden headers and bypass CORS. It can run essentially every
  non-secret source end-to-end with neither backend nor proxy in the byte path.

### The routing rule

> For each source, pick the **leftmost** environment in `[E3, E2, E1, E0]` whose
> capabilities meet the source's needs — always keeping **E0** as the floor.

A source declares what it needs via capability flags (`needsCORSBypass`,
`needsHeaderInjection`, `needsJA3`, `needsResidentialIP`, `needsServerSecret`,
`needsEdgeSecret`), and the engine's router does the placement automatically.

## How "grants" fit in

Some steps need the backend even though the *bytes* don't flow through it. These are
tiny, login-gated **grant** endpoints:

- **`/scrape-meta`** — hands the client the title set (incl. localized synonyms,
  release year, IMDb id) that only the server-held TMDB key can produce.
- **`/sign`** — mints a signed link to the edge proxy (E2). The proxy secret never
  reaches the browser.
- **`/resolve`** — for a secret-bound source, the backend does the secret part
  server-side and returns a raw stream URL the client then delivers itself.

Each returns `503` when not configured, and the client cleanly falls back — so a
half-configured instance degrades gracefully instead of breaking.

## What this means for you, the self-hoster

- A visitor **with the extension** gets the best experience: most sources resolve and
  stream directly, your backend carries almost nothing.
- A visitor **without the extension** but **with the proxy configured** still plays
  header-gated sources via E2.
- A visitor with **neither** gets whatever the backend can serve (your operator-owned
  sources) plus any CORS-friendly direct sources.

So the proxy and the extension are **bandwidth-and-capability upgrades**, not hard
requirements. Start minimal; add them as your audience grows.
