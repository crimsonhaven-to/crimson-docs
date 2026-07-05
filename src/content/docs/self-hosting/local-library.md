---
title: The local media library
description: Browse, search and play your own on-disk media as a first-class surface — the Index's "Local" view, filename/metadata indexing, per-title overviews and watch progress.
---

The [Local source](/reference/operator-sources/#local--your-own-files) answers a
*targeted* request — "give me S2E4 of this title" — by fuzzy-matching a folder on disk.
The **local media library** is the other half: it walks your enabled source roots and
turns whatever is actually there into a **browsable, searchable catalogue of titles** —
so your own files stand beside anime, shows and movies as a first-class surface, even
for files that map to no TMDB or AniList entry at all.

:::note[Additive, and off nobody's path]
The library is purely additive and appears **only when at least one Local source is
enabled** in the admin dashboard. Anime, shows, movies and manga are untouched. Turn the
Local source off and the whole surface — the Index view, the search results, the pages —
simply vanishes.
:::

## What it gives you

- **A second Index view.** The Catalogue (the Index) gains an **Anime ⇄ Local** toggle.
  Anime stays the default; the Local button only appears when a Local source is
  configured. The Local view groups your titles by their source root, with kind
  (show / movie) and genre filters, and its own search box.
- **Local results in search.** The site-wide search now also queries your library —
  your own files surface right alongside the online results, tagged with a green
  **Local** badge so the two never blur.
- **A page per title.** Every local title gets an overview page (poster, year, genres,
  synopsis, and — for a show — its episodes grouped by season) and a watch page that
  plays through the very same player as everything else.
- **Watch progress & resume.** Where you left off is saved and restored, your local
  titles appear in **Recently Watched**, and continue-watching works — see
  [Watch progress](#watch-progress) below.

## Where the work happens

Unlike the online surfaces, the library reads **only your own disk** — there are no
external calls to build it (one optional, best-effort TMDB lookup aside):

| Step | Where it runs | Why |
| --- | --- | --- |
| **Indexing** (walk the roots, build the title list) | **Backend, from disk** | It's *your* filesystem; no host is contacted. Cached briefly so a browse doesn't re-walk the tree. |
| **Metadata** (title, year, genres, synopsis, poster) | **Backend, from the files** | Read straight off `.nfo`/`.json`/container tags/filenames — see the precedence below. |
| **Poster art enrichment** (filename-only titles) | **Backend → TMDB, best effort** | A *single* optional lookup to borrow a nicer poster/synopsis when a title carries no on-disk metadata. Cached; never blocks the list. |
| **Playback** | **Same as the Local source** | The bytes stream from your disk via `/local_proxy` (direct) or `/local_hls` (transcode) — the same media proxies the Local source already uses. |

## How a title is identified

Each **top-level folder** under a root is one title; a **loose media file** sitting
directly in a root is a single-file movie. For every title the backend resolves its
display metadata in a strict order — **richest first, filename last**:

1. **`.nfo`** — a Kodi/Jellyfin sidecar (`tvshow.nfo`, `movie.nfo` or `<name>.nfo`).
   Title, year, plot, genres, and any `<uniqueid>` (tmdb / imdb / anilist) are read.
2. **Sidecar `.json`** — a `<name>.json`, `metadata.json` or `crimson.json` with
   `title` / `year` / `overview` / `genres` / `poster` / `tmdb_id`.
3. **Embedded tags** — the container's own `title`/`show` tags via `ffprobe` (used only
   when 1 and 2 are absent; bounded and cached so a big library scans quickly).
4. **Filename parse** — the floor: a cleaned folder/file name plus a year pulled from it
   (release junk like `1080p`, `[BluRay]`, `(2021)`, dots and dashes are stripped). This
   is what *"index the non-metadata parts by filename"* means.

A title that fell all the way to (4) — and carries no `tmdb_id` — additionally gets a
**best-effort live TMDB lookup** by its parsed name when you open its page, to borrow a
poster, synopsis and genres from a confident match. That result is cached, so the Index
list gets the prettier art without a lookup per title.

:::note[Works with the server-side Cache out of the box]
The [Cache](/reference/operator-sources/#cache--replay-what-was-watched) writes its files
into id-encoding folders — `tmdb-<id>/S01E02 - German Dub.mp4` (TV) and
`movie-tmdb-<id>/movie.mp4` (movie). The library **recognises that naming**: it reads the
TMDB id straight from the folder, resolves the real title/poster/genres from that id
(exact, not a fuzzy guess), and lists it under its proper name and kind. So pointing a
Local source at a copy of your cache just works — you get a browsable shelf of everything
you've cached.
:::

:::tip[Lumi says]
Give me an `.nfo` and I'll wear it exactly. Give me nothing and I'll still read the name
off the tin and go ask the archives for a portrait — but the metadata always wins over
my guesswork, and my guesswork always beats an empty shelf. ( ˶ ˆ ᗜ ˆ ˶ )
:::

### Shows, movies, seasons

A folder with several episodes is a **show**; a single-file folder (or a `movie.nfo`) is
a **movie**. Episodes are grouped into seasons — the parser understands `S01E02`,
`1x02`, `Episode 5`, `Show - 05` and `Season 2` / `Staffel 2` folders. A show with no
season/episode markers at all is simply listed as season 1, numbered by filename.

### Posters from disk

Poster / folder / cover / fanart images next to a title (or a `<name>.jpg` beside a loose
file) are surfaced through a **public, HMAC-signed** `GET /local_art` route — an `<img>`
can't carry the login-wall bearer, so the URL is signed instead (the same model as the
subtitle and manga image relays). Every request re-checks that the file is a real image
inside a currently-enabled root, so it can never become an open file proxy.

## Watch progress

Local media has no TMDB or AniList id, so progress lives in its own **`local:`
namespace**, keyed by the on-disk title. It behaves exactly like a TV show:

- **Per-episode resume** — reopen an episode and the player seeks to where you left off.
- **One history card per title** — watch ten episodes of a show and Recently Watched
  shows the show once (carrying its latest episode), not ten rows.
- **Continue watching** — in-progress local titles appear right beside your anime and
  movies; a history card routes back to the title's overview to pick up.

This reuses the existing account tables — the only change is one **additive** column
(`local_id`, holding the title's path token), so **no migration is needed**: it takes
effect the moment you deploy, and existing progress rows are untouched.

## The backend routes

All of these no-op cleanly (empty list / `404`) unless a Local source is enabled:

| Route | What it does |
| --- | --- |
| `GET /local-library` | The browsable title list for the Index's Local view (gzip-compressed; `enabled: false` when no Local source is on). |
| `GET /local-overview/{token}` | One title's detail — metadata + episodes (show) or a play descriptor (movie). Runs the optional TMDB enrichment. |
| `GET /search/local` | Title/filename search, folded into the site-wide unified search. |
| `GET /watch-local/{token}` | Streaming links for one local file, as the **same `/watch` NDJSON** the other surfaces emit — so the player pipeline is reused verbatim. |
| `GET /local_art` | Public, signed poster/cover image relay. |
| `GET /config` → `local_library_enabled` | Public flag the frontend reads to decide whether to show the Local view + search. |

`{token}` is the same opaque path token the Local source already uses (a directory token
for a title, a file token for an episode/movie) — the library needs **no database
table**; it's derived from disk on demand and cached.

## Configuration

There is **nothing new to switch on** — the library follows the Local source. Enable a
Local source in the admin dashboard and the surface appears. The relevant knobs are the
ones you already have:

| Setting | Where | Effect |
| --- | --- | --- |
| Local source(s) | Admin → Sources | Enabling one turns the whole library on; the registered roots are what it indexes. |
| Per-source **encoding** | Admin → Sources | On ⇒ non-web files (mkv / avi / …) are also indexed and play via on-the-fly HLS (`/local_hls`); off ⇒ only browser-native files (mp4 / m4v / mov / webm) appear. |
| `LOCAL_PROXY_SECRET` | Backend env | Signs `/local_art` links; **falls back to `PROXY_SECRET`**. Set `PROXY_SECRET` (stable + identical across replicas) and you never need this one. |

:::note[Encoding needs ffmpeg]
Indexing non-web containers (and playing them) uses `ffmpeg`/`ffprobe`, which ship in the
backend image. The admin dashboard greys the per-source encoding toggle out if they're
somehow unavailable.
:::

## Security, in one breath

The library reads only inside your enabled roots and **re-checks bounds on every
request** — path-traversal and symlink escapes are rejected, and disabling a source
instantly `404`s its files. The media proxies (`/local_proxy`, `/local_hls`) and the
signed `/local_art` image relay are **public**, like every other media proxy — a
`<video>`/`<img>` can't carry the login-wall bearer — but each maps its token back to a
file **only inside a currently-enabled root**, so being public never widens what they can
reach. The browsing/overview JSON routes stay behind the login wall like the rest of the
site.

## Recap

- A browsable/searchable **Local** surface built on your existing Local source — the
  Index gains an Anime ⇄ Local toggle, and your files join site-wide search.
- Metadata precedence: **`.nfo` → `.json` → embedded tags → filename**, with an optional
  best-effort TMDB poster lookup for filename-only titles.
- Playback reuses the normal player; **watch progress + resume** work via a `local:`
  namespace with **no migration**.
- Appears only when a Local source is enabled; the media + poster proxies are public
  (like every media proxy) but token-scoped to your enabled roots, while the
  browse/overview JSON stays behind the login wall.
