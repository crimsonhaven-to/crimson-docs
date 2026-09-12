---
title: Browsing & discovery
description: How the haven is explored — the search-home launchpad, the per-type browse hubs (Anime, Shows, Movies, Manga, Live TV, Local), and the /catalogue browse endpoints that feed them.
---

Every visitor arrives the same way — but where they go next is theirs to choose.
The haven used to pour anime, shows, movies and manga into one long scroll; now
each kind has its own wing, and the entrance is just a launchpad.

## The shape of it

```
   /                     the launchpad — search + trending previews
   │
   ├── /anime            Anime hub  ── Discover (default) · Archive
   ├── /shows            Shows hub
   ├── /movies           Movies hub
   ├── /manga            Manga hub
   ├── /live             Live TV — the Airwaves (only when IPTV is enabled)
   ├── /local            Local vault (only when a source is configured)
   └── /calendar         Airing calendar + your follows (signed in only)
```

- **Home (`/`)** is a *launchpad*, not a store. It carries the one search that
  opens every door, a personalized "recommended for you" row, and a short
  *preview* of what's trending in each kind — each with a **See all →** that
  walks you into that kind's hub.
- **Each media kind gets its own hub** — a dedicated browse surface with its own
  URL, its own filters, and its own sense of place. Content type is the primary
  navigation axis (the top nav is `Home · Anime · Shows · Movies · Manga ·
  Live TV · Local`), which is exactly how the detail routes were already keyed
  (`/anime/:id`, `/show/:id`, …). Signed-in visitors get `Favorites · History ·
  Calendar` after those, and [Crimson Wrapped](/reference/accounts/#crimson-wrapped)
  in the account dropdown.

The informational pages (Support, Mortals, About) moved out of the top bar into
the account dropdown and footer, so the nav stays about *browsing*.

## The two kinds of hub

Under the hood there are two flavours of browse surface, because the data lives in
two different places.

### Local catalogues (Shows, Movies) — the whole shelf, at once

Shows and movies are served **whole** from the haven's own PostgreSQL tables
(`tmdb_shows` / `tmdb_movies`) — no live TMDB call at browse time. The endpoint
returns the full list (gzipped and cached), and the client filters, sorts and
paginates it in the browser. This mirrors the original anime `/catalogue`.

- **Genre facet** — the response carries a `genres: [{ genre, count }]` list
  aggregated over the *whole* catalogue, rendered as filter chips.
- **Sort** — client-side. Movies offer *Popular · Top Rated · A–Z · Newest*;
  shows the same minus *Top Rated* (TMDB stores a rating for movies, not shows).
- **Scoped search** — each hub carries its own search box that filters **only
  that kind** (a case-insensitive title match). It's instant and entirely
  client-side — no round-trip — because the whole shelf is already in the browser.
- **Shown ~50 at a time** — a shelf of a few thousand titles is fetched whole, but
  the grid only ever *mounts* about **50 posters**, with a **"Reveal More"** button
  that unveils the next 50. Changing the search, genre or sort snaps the window
  back to the first page. So even a 2,800-title shelf stays smooth to scroll — the
  jank was never the fetch, it was rendering thousands of tiles at once.
- **Popularity** — both tables now carry a `popularity` column so the default
  order is *popular first* rather than alphabetical. It's populated lazily as
  titles are viewed and in bulk by the nightly TMDB-discover backfill, so a fresh
  install's shelves fill in over time (run the admin backfill to prime them).

### Live catalogues (Anime, Manga) — one page at a time

Anime and manga are browsed **live against AniList**, one page at a time:

- **Manga** has no local table at all (the backend keeps only an AniList → id
  cache), so a genre/sort browse *must* be live.
- **Anime** *does* have a local catalogue — but it's **~6,800 mapped titles**, and
  shipping + rendering that whole list is slow. So the anime hub's **default**
  view is the same fast, paginated, poster-rich AniList grid, and the full local
  archive becomes a secondary view (see below).

Both drive `genre` + `sort` **server-side** (each change re-queries page 1) and
append pages with a **"Reveal More"** button (`has_next` drives it). There's no
free-text search box on these hubs — the home search covers that. Sorts map to
AniList's `MediaSort`: *Trending · Popular · Top Rated · Newest · A–Z*.

:::caution[When AniList is having a bad day]
AniList's public API occasionally goes down — and it answers a *failed* request
with **HTTP 200** plus an `errors` field, not an HTTP error. The browse fetcher
detects that and logs it; what happens next depends on the surface:

- **Anime** — Discover **never goes dark**. When AniList is unreachable,
  `/catalogue/anime` quietly serves a **local-DB fallback** instead of erroring: a
  paginated, genre-filterable grid drawn from the ~6,800-title archive
  (poster-bearing titles surfaced first), with **page 1 seeded from TMDB trending
  anime** so the first screen still leads with current posters. The response is
  flagged `fallback: true`, and a soft banner tells the visitor they're seeing the
  local Archive. It heals itself the moment AniList recovers — no toggle, no
  reload. The TMDB seed is best-effort, so a *simultaneous* TMDB outage simply
  drops the top-up and the pure local list carries on.
- **Manga** — there is *no* local manga data, so the manga hub simply returns
  **503** ("temporarily unavailable") during an AniList outage. Nothing to fall
  back to.
:::

### The Live TV hub — a third flavour, from memory

The **Airwaves** (`/live`) browse neither a database table nor a live third-party
API: the backend keeps the whole [iptv-org channel catalogue](/self-hosting/live-tv/)
**in memory** (~10,000 channels, refreshed twice daily) and filters it
server-side. Category and country chips and the hub's search all re-query
`GET /iptv/channels` (`?category=&country=&q=&page=`), with the usual
"Reveal More" appending pages. The facets come from `GET /iptv/browse`. On a
freshly-booted replica the catalogue warms in the background — until it lands
the routes answer `ready: false` and the hub shows its tuning state, then fills
in by itself.

## Search: local first, TMDB second

The one search on the launchpad fires across five surfaces per keystroke, debounced
at 300ms from three characters. Three of those used to cross the network to TMDB on
every round.

`/search/anime` now answers from the haven's **own** `anime_entries` table first, and
only consults TMDB when the local catalogue returns **fewer than three** hits (so a
title added upstream since the last Fribb resync still resolves). Local rows come
first in the merged list, deduplicated on `anilist_id`.

This is not only faster, it has **better recall**. The TMDB path took TMDB's first ten
results and then discarded every one without a local AniList mapping, so the answer
was already constrained to the local mapping universe: the round trip was paid first,
and a title that maps perfectly well could be pushed out of TMDB's top ten by titles
that map to nothing at all.

The response shape is unchanged, so the client's autocomplete needed no change.
`/search/shows` and `/search/movies` are deliberately **untouched**: `tmdb_shows` and
`tmdb_movies` are sparse by design (populated lazily, holding only what someone has
opened once), so local-first there would return almost nothing.

Ranking is a SQL `CASE` in four buckets: exact title, prefix, substring, and last the
rows that matched on `title_native` alone (usually incidental for a Latin-script
query). `LIKE` wildcards in the query are escaped, so a member typing `%` matches the
literal character rather than the entire catalogue.

`migrations/003_search_trgm.sql` adds `pg_trgm` and GIN trigram indexes on the three
title columns, which is what makes a leading-wildcard `ILIKE` fast. The index is
**optional to the query, not required by it**: nothing in the code path asks whether
the extension exists, and a database where `CREATE EXTENSION` is refused runs the
identical search, just more slowly. See
[the database page](/self-hosting/database/#versioned-migrations) for what happens on
a locked-down role.

## The Anime hub: Discover vs Archive

The anime hub carries a small view toggle (a per-session UI choice — it is **not**
saved to your preferences):

| View | What it is | Source |
| --- | --- | --- |
| **Discover** *(default)* | Fast, paginated, poster-rich AniList grid — genre + sort + "Reveal More". | Live AniList (`/catalogue/anime`), auto-falling back to the local DB during an AniList outage. |
| **Archive** | The full ~6,800-title mapped catalogue, grouped by format (TV / Movie / OVA / …) with a genre filter and search. | Local DB (`/catalogue`) |

The heavy Archive view **only loads when you switch to it** — its catalogue fetch
and 6,800-row render never run while you're on Discover, so the landing view stays
instant.

## The browse endpoints

All live at the backend root, behind the login wall like the rest of discovery
(don't add them to the public allow-list). Each returns `success` + a kind-named
item array; genres are always the whole-catalogue facet for the filter chips.

| Endpoint | Source | Paged? | Item array | Notes |
| --- | --- | --- | --- | --- |
| `GET /catalogue` | `anime_entries` (local) | no | `animes` | The full anime archive; adds `categories` (format) facet. |
| `GET /catalogue/anime` | AniList (live) | yes | `animes` | The fast default anime view. `?genre=&sort=&page=`. Falls back to the local DB (never 503) when AniList is down — flagged `fallback: true`. |
| `GET /catalogue/shows` | `tmdb_shows` (local) | no | `shows` | `?genre=`. Popular-first. |
| `GET /catalogue/movies` | `tmdb_movies` (local) | no | `movies` | `?genre=`. Carries `vote_average`. |
| `GET /catalogue/manga` | AniList (live) | yes | `manga` | `?genre=&sort=&page=`. Behind the manga gate (503 when disabled); also 503 during an AniList outage (no local fallback). |

**Paginated response** (`/catalogue/anime`, `/catalogue/manga`):

```json
{
  "success": true,
  "count": 30,
  "total": 4213,
  "page": 1,
  "has_next": true,
  "sort": "trending",
  "fallback": false,
  "genres": [{ "genre": "Action" }, { "genre": "Romance" }],
  "animes": [
    { "anilist_id": 16498, "title": "…", "poster": "https://…",
      "year": 2013, "vote_average": 8.6, "kind": "anime" }
  ]
}
```

`fallback` is normally `false`; it flips to `true` only when `/catalogue/anime`
is serving the local-DB stand-in during an AniList outage (the client shows a
banner while it is). `/catalogue/manga` never sets it.

**Whole-list response** (`/catalogue/shows`, `/catalogue/movies`):

```json
{
  "success": true,
  "count": 1820,
  "total": 1820,
  "genres": [{ "genre": "Drama", "count": 412 }],
  "shows": [
    { "tmdb_id": 1396, "anilist_id": null, "kind": "show",
      "title": "…", "poster": "https://…", "year": "2008",
      "popularity": 210.4, "genres": ["Drama", "Crime"] }
  ]
}
```

Every item is tagged with a `kind`, and that plus its id is what routes it:
`anime`/`manga` → `/anime/{anilist_id}` · `/manga/{anilist_id}`; `show`/`movie` →
`/show/{tmdb_id}` · `/movie/{tmdb_id}`; `local` → `/local/{token}`.

## Where it lives in the code

- **Search**: `search_anime_entries` in `web/queries.py`, called by
  `/search/anime` in `web/routes/discovery.py` before it considers TMDB.
- **Backend** — `web/routes/discovery.py` (`/catalogue*` for anime/shows/movies) and
  `manga_engine/routes.py` (`/catalogue/manga`). The local builders are in
  `web/queries.py`; the live AniList browse is `_fetch_media_catalogue` in
  `metadata_engine/anilist.py`. The AniList-outage stand-in is
  `_build_local_anime_fallback` in `web/routes/discovery.py` (poster-first ordering
  in `_order_local_anime`, TMDB seed from `fetch_trending_anime`). The `popularity`
  column is defined in `metadata_engine/db_handler.py` and written by
  `metadata_engine/store.py`.
- **Client** — the hubs are `AnimeHub` / `ShowsHub` / `MoviesHub` / `MangaHub` /
  `LocalHub`; their data hooks live in `src/hooks/browse.js`; the shared browse
  chrome is in `src/hubKit.jsx` with the pure helpers in `src/hubHelpers.js`. The
  Shows/Movies render window (~50 tiles + "Reveal More") lives in `PosterBrowseHub`;
  the outage banner is `FallbackBanner`, shown by `PaginatedBrowseHub` when the hook
  reports `fallback`.
