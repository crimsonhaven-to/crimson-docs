---
title: The Live TV surface (IPTV)
description: How Crimson Haven's Live TV surface works — the iptv-org public index, the twice-daily catalogue, direct-first playback with the signed proxy fallback, and the live player mode.
---

Alongside anime, shows, movies, manga and your local vault there is another
**additive** content surface: **Live TV** — the world's free-to-air broadcasts,
browsable by country and category, playing in the haven's own player.

It rests on the [iptv-org project](https://github.com/iptv-org/iptv): a public,
community-curated **index** of publicly available broadcast streams, refreshed
daily. The haven hosts, stores and ships none of it — the backend fetches that
index the way it fetches TMDB or AniList metadata, joins it into a browsable
catalogue, and hands the viewer's browser the broadcaster's own stream. The
catalogue honours iptv-org's own **blocklist** (channels removed at a rights
holder's request are never surfaced) and excludes NSFW-flagged channels unless
you explicitly opt in.

:::note[Additive, and off in one switch]
Live TV is purely additive — anime, shows, movies, manga and the local vault are
untouched. It needs **no API key and no account**: the index is public. If you'd
rather not offer it, one switch (`IPTV_ENABLED=false`) hides the whole thing —
the routes answer `503` and the client drops the nav entry.
:::

## The catalogue

Twice a day (and once at boot), each backend replica pulls the iptv-org JSON API
— channels, streams, categories, countries, logos and the blocklist, ~25 MB in
all — and joins it into an **in-process catalogue** of roughly **10,000 playable
channels**. There is no database table and no migration: the surface works the
moment you deploy, and a fresh replica warms itself in the background (the hub
shows its tuning state for the few seconds that takes, then fills in by itself).

A channel makes the catalogue only when it is alive (not closed or replaced),
permitted (not blocklisted, not NSFW unless opted in) and actually **playable**
(at least one known stream). Streams are ordered best-quality-first.

| Route | What it does |
| --- | --- |
| `GET /iptv/browse` | The browse facets — categories and countries, each with a channel count. |
| `GET /iptv/channels` | Paged channel cards, filtered server-side by `category`, `country` and/or a search term `q`. |
| `GET /iptv/channel/{id}` | One channel's full detail — every known feed, best quality first, each with its direct URL and its signed proxy path. |
| `GET /iptv_proxy` | The signed same-origin relay (below) — the **only** public route; everything else sits behind the login wall like all content routes. |

## Playback: direct-first, with a quiet safety net

IPTV exists to be watched, and most of it can be watched **straight off the
broadcaster's CDN** — costing your backend nothing. But the *browser's* security
model draws three hard lines that no amount of goodwill from the broadcaster can
cross:

1. **Mixed content** — an `https://` page refuses to load `http://` media, and
   about **18%** of the index is plain-http.
2. **CORS** — the player (hls.js) fetches playlists and segments with XHR, so the
   CDN must answer `Access-Control-Allow-Origin`. Measured across the live
   catalogue, roughly **a third of otherwise-playable https streams don't**.
3. **Gated headers** — some feeds demand a `Referer` or `User-Agent` the browser
   will not let a page send (~6%).

So playback is **direct-first with an automatic fallback**:

- A feed that is https and demands no headers (`direct_ok` — **77%** of the
  catalogue) is handed to the player as its **raw URL**. Whether the CDN serves
  CORS can only be discovered by trying — most do, and the stream flows
  **CDN → browser** with zero backend bandwidth.
- If that direct attempt hits a wall (a CORS block, a dead host), the player
  quietly retunes the same feed through **`/iptv_proxy`** — no error screen, just
  a brief re-buffer. Plain-http and header-gated feeds start on the proxy, since
  they can never play direct.

In practice **more than half of all live viewing never touches your server**, and
the rest still works.

### The signed relay

`/iptv_proxy` is public (a media element can't carry the login-wall bearer
cross-origin) but it is **never an open relay**:

- Every URL it will fetch is **HMAC-signed** by the backend — and the signature
  covers the `Referer`/`User-Agent` overrides too, so a caller can't replay a
  valid stream signature with headers of their choosing.
- Fetches run through the same **SSRF-guarded client** as the other operator
  proxies: any upstream (or redirect hop) that resolves to a private, loopback or
  link-local address is refused.
- HLS playlists come back **rewritten**, so every variant, segment and key a
  playlist references flows back through the relay with its own signature.

Signing uses `PROXY_SECRET` (or `IPTV_PROXY_SECRET` to override) — the same
stable, replica-shared secret discipline as every other signed link. See
[Proxy & edge secrets](/reference/proxy-env/).

:::tip[Lumi says]
The proxy isn't there because the broadcasts are shy — it's there because the
*browser* is strict. Where the browser allows it, the stream goes straight from
the broadcaster to the viewer and my haven never sees a byte. Where it doesn't,
the relay steps in so the viewer never has to know the difference. ( ˶ ˆ ᗜ ˆ ˶ )
:::

## The hub and the live player

- **`/live` — the Airwaves.** A channel grid built for broadcaster marks (logos
  render contained on glass tiles, never cropped), with a pulsing LIVE badge and
  the best-known quality on every card. Filter by **Rite** (category) and
  **Realm** (country, flag and all — the top realms up front, the rest behind
  *More Realms*), or search the whole catalogue server-side.
- **`/watch-live/{channel}`.** Live broadcasts don't pretend to be episodes: the
  watch page feeds the haven's player in its **live mode** — no seek bar, no
  skip-10s, no resume, no download (an endless stream never finishes saving), a
  pulsing **LIVE** crest where the timestamps would be. Quality levels inside a
  feed still switch as usual.
- **Feeds, not sources.** Every stream the index knows for a channel becomes a
  feed tile. Free-to-air broadcasts flicker — when one refuses to manifest,
  invoke another.

## Configuration

Everything is optional; the surface is on by default and needs no secrets.

| Variable | Default | Description |
| --- | --- | --- |
| `IPTV_ENABLED` | `true` | Master switch. `false` ⇒ the IPTV routes return `503` and the client hides the nav entry and routes. |
| `IPTV_REFRESH_HOURS` | `12` | Hours between catalogue refreshes. The upstream index publishes daily, so the default is already generous. |
| `IPTV_INCLUDE_NSFW` | `false` | Include NSFW-flagged channels. Off by default; flip it only if your haven wants them. |
| `IPTV_PROXY_SECRET` | falls back to `PROXY_SECRET` | HMAC secret that signs `/iptv_proxy` links. Reuse `PROXY_SECRET` (stable + identical across replicas); override only if you must. |

See [Backend environment](/reference/backend-env/#live-tv-iptv).

## Recap

- Live TV is an additive surface over the **iptv-org public index** — ~10,000
  free-to-air channels, refreshed twice daily, honouring the project's blocklist
  and excluding NSFW by default. Nothing is hosted, stored or shipped by you.
- **No API key, no database table** — it works the moment you deploy.
- Playback is **direct-first**: most viewing streams CDN → browser with zero
  backend bandwidth; the signed, SSRF-guarded `/iptv_proxy` quietly carries only
  what the browser's own rules (mixed content, CORS, gated headers) won't allow.
- On by default; `IPTV_ENABLED=false` turns the whole thing off.
