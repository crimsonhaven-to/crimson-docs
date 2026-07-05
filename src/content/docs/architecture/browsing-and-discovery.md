---
title: Browsing & discovery
description: How the haven is explored — the search-home launchpad, the per-type browse hubs (Anime, Shows, Movies, Manga, Local), and the /catalogue browse endpoints that feed them.
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
   └── /local            Local vault (only when a source is configured)
```

- **Home (`/`)** is a *launchpad*, not a store. It carries the one search that
  opens every door, a personalized "recommended for you" row, and a short
  *preview* of what's trending in each kind — each with a **See all →** that
  walks you into that kind's hub.
- **Each media kind gets its own hub** — a dedicated browse surface with its own
  URL, its own filters, and its own sense of place. Content type is the primary
  navigation axis (the top nav is `Home · Anime · Shows · Movies · Manga · Local`),
  which is exactly how the detail routes were already keyed (`/anime/:id`,
  `/show/:id`, …).

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

## The Anime hub: Discover vs Archive

The anime hub carries a small view toggle (a per-session UI choice — it is **not**
saved to your preferences):

| View | What it is | Source |
| --- | --- | --- |
| **Discover** *(default)* | Fast, paginated, poster-rich AniList grid — genre + sort + "Reveal More". | Live AniList (`/catalogue/anime`) |
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
| `GET /catalogue/anime` | AniList (live) | yes | `animes` | The fast default anime view. `?genre=&sort=&page=`. |
| `GET /catalogue/shows` | `tmdb_shows` (local) | no | `shows` | `?genre=`. Popular-first. |
| `GET /catalogue/movies` | `tmdb_movies` (local) | no | `movies` | `?genre=`. Carries `vote_average`. |
| `GET /catalogue/manga` | AniList (live) | yes | `manga` | `?genre=&sort=&page=`. Behind the manga gate (503 when disabled). |

**Paginated response** (`/catalogue/anime`, `/catalogue/manga`):

```json
{
  "success": true,
  "count": 30,
  "total": 4213,
  "page": 1,
  "has_next": true,
  "sort": "trending",
  "genres": [{ "genre": "Action" }, { "genre": "Romance" }],
  "animes": [
    { "anilist_id": 16498, "title": "…", "poster": "https://…",
      "year": 2013, "vote_average": 8.6, "kind": "anime" }
  ]
}
```

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

- **Backend** — `web/routes/discovery.py` (`/catalogue*` for anime/shows/movies) and
  `manga_engine/routes.py` (`/catalogue/manga`). The local builders are in
  `web/queries.py`; the live AniList browse is `_fetch_media_catalogue` in
  `metadata_engine/anilist.py`. The `popularity` column is defined in
  `metadata_engine/db_handler.py` and written by `metadata_engine/store.py`.
- **Client** — the hubs are `AnimeHub` / `ShowsHub` / `MoviesHub` / `MangaHub` /
  `LocalHub`; their data hooks live in `src/hooks/browse.js`; the shared browse
  chrome (poster grid, filter chips, the paginated-hub shell) is in `src/hubKit.jsx`
  with the pure helpers in `src/hubHelpers.js`.
