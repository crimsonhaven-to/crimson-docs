---
title: The local media library
description: Browse, search and play your own on-disk media, with the Local hub, filename and metadata indexing, per-title overviews and watch progress.
---

The [Local source](/reference/operator-sources/#local--your-own-files) answers a
*targeted* request ("give me S2E4 of this title") by fuzzy-matching a folder on disk.
The **local media library** is the other half: it walks your enabled source roots and
turns what is there into a **browsable, searchable catalogue of titles**, including
files that map to no TMDB or AniList entry.

:::note[Only when a Local source is enabled]
The library appears **only when at least one Local source is enabled** in the admin
dashboard, and changes nothing about anime, shows, movies or manga. Turn the Local
source off and the hub, the search results and the pages disappear.
:::

## What it gives you

- **A Local hub.** `/local` gets its own entry in the top nav. Its **Library** mode
  shows identified titles grouped by source root, with kind (show / movie) and genre
  filters and its own search box. Its **Browse** mode navigates the raw folders, for
  media that never resolved to a title.
- **Local results in search.** The site-wide search also queries your library. Your
  own files are listed first, tagged with a green **Local** badge.
- **A page per title.** Every local title gets an overview page (poster, year, genres,
  synopsis and, for a show, its episodes grouped by season) and a watch page that uses
  the same player as everything else.
- **Watch progress and resume.** Where you left off is saved and restored, and local
  titles appear in **Recently Watched** and continue watching. See
  [Watch progress](#watch-progress).

## Where the work happens

The library reads **only your own disk**. Apart from one optional, best-effort TMDB
lookup, it makes no external calls:

| Step | Where it runs | Why |
| --- | --- | --- |
| **Indexing** (walk the roots, build the title list) | **Backend, from disk** | It's *your* filesystem; no host is contacted. Cached briefly so a browse doesn't re-walk the tree. |
| **Metadata** (title, year, genres, synopsis, poster) | **Backend, from the files** | Read from `.nfo`, `.json`, container tags or filenames (precedence below). |
| **Poster art enrichment** (filename-only titles) | **Backend → TMDB, best effort** | A *single* optional lookup to borrow a nicer poster/synopsis when a title carries no on-disk metadata. Cached; never blocks the list. |
| **Playback** | **Same as the Local source** | Bytes stream from your disk via `/local_proxy` (direct) or `/local_hls` (transcode), the Local source's own media proxies. |

## How a title is identified

Each **top-level folder** under a root is one title; a **loose media file** sitting
directly in a root is a single-file movie. The backend resolves each title's display
metadata in a fixed order, **richest first, filename last**:

1. **`.nfo`:** a Kodi/Jellyfin sidecar (`tvshow.nfo`, `movie.nfo` or `<name>.nfo`).
   Title, year, plot, genres and any `<uniqueid>` (tmdb / imdb / anilist) are read.
2. **Sidecar `.json`:** a `<name>.json`, `metadata.json` or `crimson.json` with
   `title` / `year` / `overview` / `genres` / `poster` / `tmdb_id`.
3. **Embedded tags:** the container's own `title`/`show` tags via `ffprobe`, used only
   when 1 and 2 are absent (bounded and cached so a big library scans quickly).
4. **Filename parse:** a cleaned folder or file name plus a year pulled from it
   (release junk like `1080p`, `[BluRay]`, `(2021)`, dots and dashes is stripped).

A title that fell through to (4) and carries no `tmdb_id` also gets a **best-effort
TMDB lookup** by its parsed name when you open its page, borrowing a poster, synopsis
and genres from a confident match. The result is cached, so the library list shows the
art without a lookup per title.

:::note[Works with the server-side Cache]
The [Cache](/reference/operator-sources/#cache--replay-what-was-watched) writes its files
into id-encoding folders: `tmdb-<id>/S01E02 - German Dub.mp4` (TV) and
`movie-tmdb-<id>/movie.mp4` (movie). The library **recognises that naming**: it reads the
TMDB id from the folder, resolves the exact title, poster and genres from that id, and
lists it under its proper name and kind. Point a Local source at a copy of your cache
and you get a browsable shelf of everything you have cached.
:::

:::tip[Lumi says]
Give me an `.nfo` and I'll wear it exactly. Give me nothing and I'll still read the name
off the tin and ask the archives for a portrait. The metadata always wins over my
guesswork, and my guesswork always beats an empty shelf. ( ˶ ˆ ᗜ ˆ ˶ )
:::

### Shows, movies, seasons

A folder with several episodes is a **show**; a single-file folder (or a `movie.nfo`) is
a **movie**. Episodes are grouped into seasons; the parser understands `S01E02`,
`1x02`, `Episode 5`, `Show - 05` and `Season 2` / `Staffel 2` folders. A show with no
season or episode markers is listed as season 1, numbered by filename.

### Posters from disk

Poster / folder / cover / fanart images next to a title (or a `<name>.jpg` beside a loose
file) are served through a **public, HMAC-signed** `GET /local_art` route. An `<img>`
cannot carry the login-wall bearer, so the URL is signed instead (the same model as the
subtitle and manga image relays). Every request re-checks that the file is a real image
inside a currently enabled root, so the route cannot become an open file proxy.

## Watch progress

Local media has no TMDB or AniList id, so progress lives in its own **`local:`
namespace**, keyed by the on-disk title. It behaves like a TV show:

- **Per-episode resume:** reopen an episode and the player seeks to where you left off.
- **One history card per title:** watch ten episodes of a show and Recently Watched
  lists the show once (with its latest episode), not ten rows.
- **Continue watching:** in-progress local titles appear beside your anime and movies;
  a history card routes back to the title's overview.

Progress uses the same account table as other media, with the title's path token in
its `local_id` column.

## The backend routes

All of these return an empty result or `404` unless a Local source is enabled:

| Route | What it does |
| --- | --- |
| `GET /local-library` | The title list for the Local hub's Library mode (gzip-compressed; `enabled: false` when no Local source is on). |
| `GET /local-browse` | One directory's children (or the enabled roots when `token` is omitted), for the Browse mode. |
| `GET /local-overview/{token}` | One title's detail: metadata and episodes (show) or a play descriptor (movie). Runs the optional TMDB enrichment. |
| `GET /search/local` | Title/filename search, folded into the site-wide unified search. |
| `GET /watch-local/{token}` | Streaming links for one local file, in the **same `/watch` NDJSON** the other surfaces emit, so the player pipeline is reused as is. |
| `GET /local_art` | Public, signed poster/cover image relay. |
| `GET /config` → `local_library_enabled` | Public flag the frontend reads to decide whether to show the Local hub and search results. |

`{token}` is the same opaque path token the Local source already uses (a directory token
for a title, a file token for an episode or movie). The library has **no database
table**: it is derived from disk on demand and cached.

## Configuration

There is **nothing extra to switch on**: the library follows the Local source. Enable
a Local source in the admin dashboard and the hub appears. The relevant settings:

| Setting | Where | Effect |
| --- | --- | --- |
| Local source(s) | Admin → Sources | Enabling one turns the whole library on; the registered roots are what it indexes. |
| Per-source **encoding** | Admin → Sources | On ⇒ non-web files (mkv / avi / …) are also indexed and play via on-the-fly HLS (`/local_hls`); off ⇒ only browser-native files (mp4 / m4v / mov / webm) appear. |
| `LOCAL_PROXY_SECRET` | Backend env | Signs `/local_art` links, **used only when `PROXY_SECRET` is unset** (`PROXY_SECRET` takes precedence). Set `PROXY_SECRET` (stable and identical across replicas) and you never need this one. |

:::note[Encoding needs ffmpeg]
Indexing non-web containers (and playing them) uses `ffmpeg`/`ffprobe`, which ship in the
backend image. The admin dashboard greys out the per-source encoding toggle if they are
unavailable.
:::

## Security

The library reads only inside your enabled roots and **re-checks bounds on every
request**: path-traversal and symlink escapes are rejected, and disabling a source
immediately `404`s its files. The media proxies (`/local_proxy`, `/local_hls`) and the
signed `/local_art` image relay are **public** like every other media proxy, because a
`<video>` or `<img>` cannot carry the login-wall bearer. Each maps its token back to a
file **only inside a currently enabled root**, so being public never widens what they
can reach. The browse and overview JSON routes stay behind the login wall.

## Recap

- A browsable, searchable **Local** hub (`/local`) built on your existing Local
  source; your files also join site-wide search.
- Metadata precedence: **`.nfo` → `.json` → embedded tags → filename**, with an optional
  best-effort TMDB poster lookup for filename-only titles.
- Playback reuses the normal player; **watch progress and resume** work via a `local:`
  namespace.
- Appears only when a Local source is enabled. The media and poster proxies are public
  but token-scoped to your enabled roots; the browse and overview JSON stays behind
  the login wall.
