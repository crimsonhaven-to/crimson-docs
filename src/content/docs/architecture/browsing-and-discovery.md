---
title: Browsing & discovery
description: The search-first home page, the per-type browse hubs (Anime, Shows, Movies, Manga, Live TV, Local), and the /catalogue endpoints that feed them.
---

Each media kind has its own browse hub, and the home page is a launchpad into them.

## The shape of it

```
   /                     the launchpad: search + trending previews
   │
   ├── /anime            Anime hub  ── Discover (default) · Archive
   ├── /shows            Shows hub
   ├── /movies           Movies hub
   ├── /manga            Manga hub
   ├── /live             Live TV, the Airwaves (only when IPTV is enabled)
   ├── /local            Local vault (only when a source is configured)
   ├── /music            Music (only when music is enabled)
   └── /calendar         Airing calendar + your follows (signed in only)
```

- **Home (`/`)** is a *launchpad*. It carries the site-wide search, a personalized
  "recommended for you" row, and a short *preview* of what is trending in each kind,
  each with a **See all →** link into that kind's hub.
- **Each media kind gets its own hub** with its own URL and filters. Content type is
  the primary navigation axis (the top nav is `Home · Anime · Shows · Movies · Manga ·
  Live TV · Local · Music`), matching how the detail routes are keyed (`/anime/:id`,
  `/show/:id`, …). Live TV, Local and Music appear only when enabled. Signed-in
  visitors also get `Favorites · History · Calendar`, and
  [Crimson Wrapped](/reference/accounts/#crimson-wrapped) in the account dropdown.

The informational pages (Support, Mortals, About) live in the account dropdown and
footer, so the nav stays about browsing.

## The two kinds of hub

There are two kinds of browse surface, because the data lives in two places.

### Local catalogues (Shows, Movies): the whole shelf at once

Shows and movies are served **whole** from the haven's own PostgreSQL tables
(`tmdb_shows` / `tmdb_movies`), with no live TMDB call at browse time. The endpoint
returns the full list (gzipped and cached), and the client filters, sorts and
paginates it in the browser, like the anime `/catalogue`.

| Feature | Behaviour |
| --- | --- |
| **Genre facet** | The response carries a `genres: [{ genre, count }]` list aggregated over the *whole* catalogue, rendered as filter chips. |
| **Sort** | Client-side. Movies offer *Popular · Top Rated · A–Z · Newest*; shows the same minus *Top Rated* (TMDB stores a rating for movies, not shows). |
| **Scoped search** | Each hub's search box filters **only that kind** (case-insensitive title match), instantly and without a round trip, because the whole shelf is already in the browser. |
| **~50 at a time** | The grid mounts about **50 posters**, and **"Reveal More"** adds the next 50. Changing the search, genre or sort resets to the first page. Rendering thousands of tiles at once, not the fetch, is what made large shelves slow. |
| **Popularity** | Both tables carry a `popularity` column, so the default order is *popular first*. It is filled lazily as titles are viewed and in bulk by the nightly TMDB-discover backfill, so a fresh install's shelves fill in over time (run the admin backfill to prime them). |

### Live catalogues (Anime, Manga): one page at a time

Anime and manga are browsed **live against AniList**, one page at a time:

- **Manga** has no local table at all (the backend keeps only an AniList → id
  cache), so a genre/sort browse *must* be live.
- **Anime** *does* have a local catalogue, but at **~6,800 mapped titles** shipping
  and rendering the whole list is slow. The anime hub's **default** view is therefore
  the paginated AniList grid, and the full local archive is a secondary view (see
  below).

Both drive `genre` + `sort` **server-side** (each change re-queries page 1) and
append pages with a **"Reveal More"** button (driven by `has_next`). These hubs have
no free-text search box; the home search covers that. Sorts map to AniList's
`MediaSort`: *Trending · Popular · Top Rated · Newest · A–Z*.

:::caution[When AniList is down]
AniList's public API occasionally goes down, and it answers a *failed* request with
**HTTP 200** plus an `errors` field, not an HTTP error. The browse fetcher detects and
logs that. What happens next depends on the surface:

- **Anime:** when AniList is unreachable, `/catalogue/anime` serves a **local-DB
  fallback** instead of an error: a paginated, genre-filterable grid from the
  ~6,800-title archive (titles with posters first), with **page 1 seeded from TMDB
  trending anime** so the first screen leads with current posters. The response is
  flagged `fallback: true`, and a banner tells the visitor they are seeing the local
  Archive. Live results return as soon as AniList recovers, with no toggle or reload.
  The TMDB seed is best-effort: if TMDB is down too, the plain local list is served.
- **Manga:** there is no local manga data, so the manga hub returns **503**
  ("temporarily unavailable") during an AniList outage.
:::

### The Live TV hub: from memory

The **Airwaves** (`/live`) browse neither a database table nor a live third-party
API: the backend keeps the whole [iptv-org channel catalogue](/self-hosting/live-tv/)
**in memory** (~10,000 channels, refreshed twice daily) and filters it server-side.
Category and country chips and the hub's search all re-query `GET /iptv/channels`
(`?category=&country=&q=&page=`), with "Reveal More" appending pages. The facets come
from `GET /iptv/browse`. On a freshly booted replica the catalogue warms in the
background; until it is ready the routes answer `ready: false` and the hub shows its
tuning state, then fills in by itself.

## Search: local first, TMDB second

The launchpad search queries five surfaces per keystroke, debounced at 300 ms, from
three characters on.

`/search/anime` answers from the haven's **own** `anime_entries` table first, and only
consults TMDB when the local catalogue returns **fewer than three** hits (so a title
added upstream since the last Fribb resync still resolves). Local rows come first in
the merged list, deduplicated on `anilist_id`.

Local-first is faster and has **better recall**. TMDB results without a local AniList
mapping are discarded anyway, so a TMDB-first search could lose a well-mapped title
that TMDB ranked below ten unmappable ones.

`/search/shows` and `/search/movies` stay TMDB-first: `tmdb_shows` and `tmdb_movies`
are sparse by design (filled lazily with what someone has opened), so a local-first
search there would return almost nothing.

Ranking is a SQL `CASE` in four buckets: exact title, prefix, substring, and last the
rows that matched on `title_native` alone (usually incidental for a Latin-script
query). `LIKE` wildcards in the query are escaped, so a member typing `%` matches the
literal character rather than the entire catalogue.

`migrations/003_search_trgm.sql` adds `pg_trgm` and GIN trigram indexes on the three
title columns, which is what makes a leading-wildcard `ILIKE` fast. The index is
**optional to the query, not required by it**: nothing in the code path asks whether
the extension exists, and a database where `CREATE EXTENSION` is refused runs the
identical search, only more slowly. See
[the database page](/self-hosting/database/#versioned-migrations) for what happens on
a locked-down role.

## The Anime hub: Discover vs Archive

The anime hub has a view toggle. It is a per-session choice, **not** saved to your
preferences.

| View | What it is | Source |
| --- | --- | --- |
| **Discover** *(default)* | Paginated AniList poster grid with genre, sort and "Reveal More". | Live AniList (`/catalogue/anime`), auto-falling back to the local DB during an AniList outage. |
| **Archive** | The full ~6,800-title mapped catalogue, grouped by format (TV / Movie / OVA / …) with a genre filter and search. | Local DB (`/catalogue`) |

The Archive view **loads only when you switch to it**: its catalogue fetch and
6,800-row render never run while you are on Discover.

## The browse endpoints

All live at the backend root, behind the login wall like the rest of discovery (do
not add them to the public allow-list). Each returns `success` and a kind-named item
array; `genres` is always the whole-catalogue facet for the filter chips.

| Endpoint | Source | Paged? | Item array | Notes |
| --- | --- | --- | --- | --- |
| `GET /catalogue` | `anime_entries` (local) | no | `animes` | The full anime archive; adds `categories` (format) facet. |
| `GET /catalogue/anime` | AniList (live) | yes | `animes` | The fast default anime view. `?genre=&sort=&page=`. Falls back to the local DB (never 503) when AniList is down, flagged `fallback: true`. |
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

- **Search**: `search_anime_entries` in `metadata_engine/catalogue.py`, called by
  `search_anime` in `metadata_engine/search.py` (the `/search/anime` route) before it
  considers TMDB.
- **Backend:** `metadata_engine/discovery_routes.py` (`/catalogue*` for
  anime/shows/movies) and `manga_engine/routes.py` (`/catalogue/manga`). The local
  builders are in `metadata_engine/catalogue.py` and the facets and paging in
  `metadata_engine/browse.py`; the live AniList browse is `_fetch_media_catalogue` in
  `metadata_engine/anilist.py`. The AniList-outage stand-in is `local_anime_fallback`
  in `metadata_engine/browse.py` (poster-first ordering in `order_local_anime`, TMDB
  seed from `fetch_trending_anime`). The `popularity` column is defined in
  `metadata_engine/mapping_sync.py` and written by `metadata_engine/store.py`.
- **Client:** the hubs are `AnimeHub` / `ShowsHub` / `MoviesHub` / `MangaHub` /
  `LocalHub`; their data hooks live in `src/hooks/browse.js`; the shared browse
  chrome is in `src/hubKit.jsx` with the pure helpers in `src/hubHelpers.js`. The
  Shows/Movies render window (~50 tiles + "Reveal More") lives in `PosterBrowseHub`;
  the outage banner is `FallbackBanner`, shown by `PaginatedBrowseHub` when the hook
  reports `fallback`.
