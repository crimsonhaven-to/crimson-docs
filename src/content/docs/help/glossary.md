---
title: Glossary
description: Plain definitions of the terms used throughout the Crimson Haven documentation.
---

A quick reference for the words that recur in these archives.

### E0 / E1 / E2 / E3
The four **execution environments** a source can run in, from the fallback backend (E0)
up to the companion extension (E3). See [The New System](/architecture/new-system/).

- **E0 — Backend.** The floor; serves operator-owned sources and holds secrets.
- **E1 — Plain browser fetch.** Real browser, but bound by CORS + forbidden headers.
- **E2 — Edge proxy.** Header injection + CORS relay, but a datacenter IP.
- **E3 — Extension.** A real browser on the viewer's IP with header rewrite + CORS bypass.

### Grant
A small, login-gated backend endpoint (`/scrape-meta`, `/sign`, `/resolve`) that hands
the client something it can't derive itself, **without** leaking a server-held secret.

### Operator-owned source
Media the server operator controls — your own files (**Local**), the server-side
**Cache**, or your own **Jellyfin** — as opposed to third-party scraping. The only
streams the backend serves directly.

### Sources engine
Your private TypeScript package (bundled into the client) that actually finds and
resolves streams. The public stack ships none. See
[Adding your own sources](/self-hosting/sources/).

### NDJSON
"Newline-delimited JSON" — one JSON object per line. The `/watch` endpoint streams
results this way so each resolved source reaches the player the instant it's ready.

### StreamLine
One line of the `/watch` NDJSON: `{type:"stream", source, streamType, url, …}`. The
client's engine emits the **same** shape, so local and backend streams merge seamlessly.

### MediaCtx
The bundle of identifiers (TMDB id, season/episode, titles, year, IMDb id) that tells a
source *what* to resolve.

### Login wall
The members-only gate (`REQUIRE_LOGIN`) that requires a valid session on content
endpoints. See [Accounts](/reference/accounts/).

### Mnemonic account
A passwordless account that *is* an Ed25519 key derived from a 12-word phrase held only
on the user's device. No mail server needed; no recovery if lost.

### PROXY_SECRET / NITRO_PROXY_SECRET
The shared HMAC secret that lets the backend sign edge-proxy links and the proxy verify
them. **Same value on both sides.**

### Edge secret
A secret held by the proxy **edge** (e.g. a Jellyfin token) and applied on the byte path,
so even that source's bytes leave the backend — without the secret ever reaching the
browser.

### Capability flags
Per-source declarations (`needsCORSBypass`, `needsJA3`, `needsResidentialIP`,
`needsServerSecret`, …) that tell the engine's router which environment can run a source.

### Submodule
A git repository nested inside another. The client bundles your **sources** as a
submodule at build time. (The companion extension is no longer vendored — it ships on
the Chrome Web Store.) See [CI/CD](/deployment/cicd/).

### TMDB / AniList
[The Movie Database](https://www.themoviedb.org/) and [AniList](https://anilist.co/) —
the metadata sources the backend maps together for posters, titles and episode data.

### Fribb mapping
The dataset the backend uses to map TMDB TV shows/seasons to their AniList ids, resynced
periodically (on exactly one replica).

### iptv-org
The public, community-curated [index of free-to-air broadcast streams](https://github.com/iptv-org/iptv)
that powers the [Live TV surface](/self-hosting/live-tv/). The backend fetches its JSON
API twice daily into an in-memory catalogue — no key, no database table — and honours
the project's blocklist.

### The Lumi grant
The per-account permission to talk to [Lumi's chatbot](/self-hosting/lumi/). Deny-by-default
for everybody, handed out one member at a time on **Admin › Users**, and audited like an
admin promotion, because it lets that member spend money against your provider key.

### Tool call
How the chatbot touches your catalogue. Instead of answering from memory, the model asks
the backend to run one of five named functions (search, recommend, resume, watchlist,
open) and answers from the result. Each one is a thin wrapper over an engine that already
exists, so she can't contradict the rest of the API. A **tool round** is one such
request-and-answer, capped per reply so a model that keeps searching can't keep billing.

### Follow (subscription)
A member marking one anime so it lights up on the
[airing calendar](/self-hosting/airing-calendar/) and, if the operator enabled the
mail, so they get a notice when a new episode airs. Always available; the email half
is opt-in per deployment and per follow.

### Claim-before-send
The rule the notification job runs on: a row is inserted for
`(user, title, episode)` *before* the mail is attempted, and the insert's rowcount is
what grants the right to send. Sending first and recording after would mail the same
episode on every tick forever if the recording failed.

### Crimson Wrapped
A member's [year in review](/reference/accounts/#crimson-wrapped), built from an
append-only `watch_events` table. Its `approximate` flag says when part of the year
predates that table and was reconstructed from the weaker progress rows instead.

### Public session id
A one-way hash *over* a session's `token_hash`, derived in the data layer, so a member
can list and revoke their own sessions without the server ever publishing the SHA-256
of a live bearer token.

### Single-flight
Collapsing concurrent misses on the same cache key onto one upstream fetch: the first
caller fetches, the rest await the same result. Applied to the AniList and TMDB
fetchers with the widest fan-in, per process.

### Direct-first playback
The Live TV playback model: a feed the browser is *allowed* to load (https, no gated
headers) plays straight off the broadcaster's CDN — zero backend bandwidth — and only
falls back to the signed `/iptv_proxy` when the browser's own rules (mixed content,
CORS, gated headers) forbid the direct path.
