---
title: The Live TV surface (IPTV)
description: How the Live TV surface works. The iptv-org public index, a catalogue built in the browser with the backend as fallback, direct-first playback with the companion and the signed proxy behind it, and the live player mode.
---

Live TV is an additive surface: the world's free-to-air broadcasts, browsable by
country and category, playing in the haven's own player.

It rests on the [iptv-org project](https://github.com/iptv-org/iptv), a public,
community-curated **index** of publicly available broadcast streams, refreshed daily.
The haven hosts, stores and ships none of it. The index is joined into a browsable
catalogue, and the viewer's browser plays the broadcaster's own stream. The catalogue
honours iptv-org's **blocklist** (channels removed at a rights holder's request are
never shown) and excludes NSFW-flagged channels.

:::note[Additive, and off in one switch]
Anime, shows, movies, manga and the local vault are untouched. Live TV needs **no API
key and no account**: the index is public. To turn it off, set `IPTV_ENABLED=false`:
the routes answer `503` and the client drops the nav entry.
:::

## The catalogue

A channel makes the catalogue only when it is alive (not closed or replaced), permitted
(not blocklisted, not NSFW) and **playable** (at least one known stream). Streams are
ordered best quality first.

### Built in the browser (default)

The client fetches the six iptv-org JSON files (channels, streams, categories,
countries, logos, blocklist) straight from iptv-org's GitHub Pages, which serves CORS,
joins them locally and caches the result in IndexedDB for 12 hours. Browsing and
searching cost the backend nothing, and a return visit within the window downloads
nothing. The browser catalogue always excludes NSFW channels.

### The backend catalogue (fallback)

If the browser catalogue can't load, the client falls back to the backend's `/iptv/*`
routes. You can also pin the client to them with a build-time
`VITE_CLIENT_LIVETV=false`, or per browser with `localStorage`
`crimson:clientLiveTv=0`.

Each backend replica pulls the same index (about 25 MB) once at boot and every 12 hours,
and keeps the joined catalogue of roughly **10,000 playable channels** in process. There
is no database table and no migration. While a fresh replica warms, the read routes
answer `ready: false` and the hub shows a tuning state, then fills in by itself.

| Route | What it does |
| --- | --- |
| `GET /iptv/browse` | Browse facets: categories and countries, each with a channel count. |
| `GET /iptv/channels` | Paged channel cards, filtered by `category`, `country` and/or a search term `q`. |
| `GET /iptv/channel/{id}` | One channel's detail: every known feed, best quality first, each with its direct URL and signed proxy path. |
| `GET /iptv_proxy` | The signed same-origin relay (below). The **only** public route; the rest sit behind the login wall like all content routes. |

The client also calls `/iptv/channel/{id}` when a feed has to fall back to the proxy,
since only the backend can sign the proxy link.

## Playback: a ladder, cheapest for the backend first

Most feeds can play **straight off the broadcaster's CDN** at no cost to your backend.
Three browser rules get in the way of the rest:

1. **Mixed content:** an `https://` page refuses to load `http://` media, and about
   **18%** of the index is plain http.
2. **CORS:** the player (hls.js) fetches playlists and segments with XHR, so the CDN
   must answer `Access-Control-Allow-Origin`. Roughly **a third of otherwise playable
   https streams don't**.
3. **Gated headers:** some feeds (about 6%) demand a `Referer` or `User-Agent` a page
   is not allowed to send.

Each feed climbs a ladder, moving up one step on a fatal player error:

| Step | When it applies | Where the bytes flow |
| --- | --- | --- |
| **direct** | https and no header demands (`direct_ok`, about 77% of feeds) | CDN → browser |
| **ext-rules** | https feed, companion extension present | CDN → browser; the companion injects the headers and opens CORS with declarative rules |
| **ext-fetch** | companion present (also covers plain http) | CDN → companion → page, through the companion's privileged fetch |
| **proxy** | last resort | CDN → `/iptv_proxy` → browser |

Whether a CDN serves CORS can only be found out by trying, so a `direct_ok` feed always
tries direct first. With the companion installed, a feed never touches the backend.
Without it, direct feeds still play free and only the awkward ones use the proxy. The
switch is a brief re-buffer, not an error screen.

### The signed relay

`/iptv_proxy` is public (a media element can't carry the login-wall bearer
cross-origin), but it is **never an open relay**:

- Every URL it fetches is **HMAC-signed** by the backend. The signature covers the
  `Referer` and `User-Agent` overrides too, so a caller can't replay a valid signature
  with headers of their choosing.
- Fetches use the same **SSRF-guarded client** as the other operator proxies: any
  upstream (or redirect hop) that resolves to a private, loopback or link-local address
  is refused.
- HLS playlists come back **rewritten**, so every variant, segment and key they
  reference also flows through the relay with its own signature.

Signing uses `PROXY_SECRET`, or `IPTV_PROXY_SECRET` when `PROXY_SECRET` is unset. See
[Proxy & edge secrets](/reference/proxy-env/).

:::tip[Lumi says]
The proxy isn't there because the broadcasts are shy; it's there because the
*browser* is strict. Where the browser allows it, the stream goes straight from the
broadcaster to the viewer and my haven never sees a byte. ( ˶ ˆ ᗜ ˆ ˶ )
:::

## The hub and the live player

- **`/live`, the Airwaves.** A channel grid built for broadcaster logos (shown whole on
  glass tiles, never cropped), with a LIVE badge and the best known quality on every
  card. Filter by **Rite** (category) and **Realm** (country, with flags; the top realms
  up front, the rest behind *More Realms*), or search the whole catalogue.
- **`/watch-live/{channel}`.** The watch page runs the haven's player in **live mode**:
  no seek bar, no skip buttons, no resume, no download (an endless stream never finishes
  saving), and a **LIVE** crest where the timestamps would be. Quality levels inside a
  feed still switch as usual.
- **Feeds, not sources.** Every stream the index knows for a channel becomes a feed
  tile. Free-to-air broadcasts flicker; when one doesn't play, try another.

## Configuration

Everything is optional; the surface is on by default and needs no secrets.

| Variable | Default | Description |
| --- | --- | --- |
| `IPTV_ENABLED` | `true` | Master switch. `false` makes the IPTV routes answer `503`, and the client hides the nav entry. |
| `IPTV_REFRESH_HOURS` | `12` | Age after which a request to the backend catalogue starts a background refresh. The scheduled refresh runs every 12 hours regardless, so only values below 12 change anything. |
| `IPTV_INCLUDE_NSFW` | `false` | Include NSFW-flagged channels in the **backend** catalogue. The browser catalogue always excludes them. |
| `IPTV_PROXY_SECRET` | unset | HMAC secret for `/iptv_proxy` links, used only when `PROXY_SECRET` is unset. `PROXY_SECRET` always wins, so normally leave this out. |

See [Backend environment](/reference/backend-env/#live-tv-iptv).

## Recap

- Live TV is an additive surface over the **iptv-org public index**: about 10,000
  free-to-air channels, honouring the project's blocklist and excluding NSFW. You host
  nothing.
- **No API key, no database table.** The catalogue is built in the browser by default,
  with the backend as fallback.
- Playback climbs **direct → companion → proxy**. The signed, SSRF-guarded `/iptv_proxy`
  carries only what neither the browser nor the companion can play.
- On by default; `IPTV_ENABLED=false` turns it off.
