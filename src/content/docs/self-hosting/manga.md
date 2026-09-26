---
title: The reading surface (manga)
description: How the manga surface works. AniList discovery on the backend, chapters and pages resolved in the viewer's browser, the reader, and the optional server-side provider.
---

Reading is an additive surface next to anime, shows and movies. It shares the login
wall, favorites and "continue where you left off" with the video surfaces, but its
unit is a chapter of pages instead of a stream.

The same rule applies as everywhere else: **the backend never talks to a manga host.**
Discovery and metadata come from AniList (public metadata, like TMDB for video). The
chapter list and page images are resolved in the **viewer's browser** by your sources
engine, so no manga content flows through your server.

:::note[Additive, and off in one switch]
Anime, shows and movies are untouched: manga gets its own trending row, search results
and reader. To turn it off, set `MANGA_ENABLED=false`.
:::

## Where the work happens

Reading splits along the same seam as the [New System](/architecture/new-system/):

| Step | Where it runs | Why |
| --- | --- | --- |
| **Discovery and metadata** (trending, search, covers, synopsis) | **Backend** (AniList) | Public metadata, the same place the anime surface draws from. Names no manga host. |
| **Chapter list** (which chapters exist, in which language) | **Viewer's browser** | Comes from the manga sources, which the public backend never contacts. |
| **Page images** | **Viewer's browser → `<img>`** | Raw CDN URLs loaded straight into an `<img>`. Image loads are not subject to CORS, so **no proxy touches the bytes**. |

The bundled engine ships two sources, **MangaDex** and **WeebCentral**. A title is
resolved against both in parallel, and when more than one matches, the overview offers
a source picker. Neither needs an API key.

Neither answers CORS for a third-party origin, so the three lookups (search, chapter
list, page list) need a CORS bypass: a "plain-CORS discovery" source in New System
terms (constraint **C1**). They route through the **companion extension (E3)** or the
**edge proxy (E2)**, exactly like a header-only video source. The page images need
nothing: an `<img>` loads the raw CDN URLs (`*.mangadex.network` for MangaDex) directly.

### What the client engine exposes

The sources engine (`crimson-sources`) has a small sibling of the video engine for
reading. It is **not** part of `streamEpisode`, since its unit is a chapter, not a
stream:

```ts
import { createMangaEngine, getExtensionBridge } from "crimson-sources";

const manga = await createMangaEngine({ extension: getExtensionBridge(), signProxyUrl });
if (manga.available) {                                  // else leave it to the backend
  const results = await manga.resolveAll(candidateTitles, contentRating, "en");
  // results: [{ sourceId, sourceLabel, mangaId, chapters }, …] (chapter ids tagged "{sourceId}:{rawId}")
  const pages = await manga.pages(results[0].chapters[0].id);   // raw URLs for <img>
}
```

`available` is `false` when neither the extension (E3) nor a configured proxy (E2) can
run. A visitor with neither sees no chapters (unless you run the optional server-side
provider below). The page still renders its metadata.

The no-op stub the client falls back to when you bundle no sources also implements the
manga engine, so a sources-free build compiles and shows no chapters. See
[Adding your own sources](/self-hosting/sources/).

## The backend's role (metadata and orchestration only)

Discovery is pure AniList. The overview hands the browser what it needs to resolve the
chapters itself:

| Route | What it does |
| --- | --- |
| `GET /trending/manga` | Trending manga (AniList). |
| `GET /search/manga` | Manga search (AniList). Also folded into unified search. |
| `GET /catalogue/manga` | One page of the browse hub (AniList), with optional `genre` and `sort`. |
| `GET /manga-overview/{anilist_id}` | AniList metadata **plus** the candidate titles, language and content rating the browser needs to resolve the chapter list. On a base build the chapter list is empty (the browser fills it). |
| `GET /read/{anilist_id}/{chapter_id}` | A chapter's page images, **only** on a build with the server-side provider (below). Otherwise it answers `404` and the browser resolves the pages. |
| `GET /manga_proxy` | Signed same-origin image relay, **only** with the provider. Answers `503` otherwise. |

The reading surface adds no database table, so **it needs no migration**. With a
provider, the AniList to MangaDex id mapping and the chapter list are kept in the
backend's response cache.

## The reader

- **Two modes:** a vertical **long strip** (the default, for webtoons and manga alike)
  and a **single-page paged** mode with **right-to-left** support. Both choices are
  remembered.
- **Launches inline** with the site nav visible and a full control bar: page
  **scrubber**, page counter, previous/next **page** and **chapter**, and the mode, RTL
  and fullscreen toggles. A slim header carries the title, the current chapter and a
  chapter picker.
- **Fullscreen** uses the browser's Fullscreen API. The controls auto-hide while you
  read and come back on mouse move or scroll up. A small **exit** button stays visible
  in fullscreen so you can never get stuck. Keyboard: `F` toggles fullscreen, the arrow
  keys turn pages in paged mode (respecting RTL), `Esc` leaves the reader.
- **Continue reading.** Progress is saved as you read. "Continue", from the overview or
  the Recently Watched row, opens the right chapter and page.
- **Favorites.** A manga can go on any of your lists next to anime, shows and movies. A
  tag on each card tells the four kinds apart.

Progress and favorites **reuse the existing account tables**: a manga is stored under a
`manga:` namespace, with the chapter in the episode field and the page in the position
field. Continue reading and cross-device sync work with no schema change.

## Configuration

Everything is optional; the surface is on by default.

| Variable | Default | Description |
| --- | --- | --- |
| `MANGA_ENABLED` | `true` | Master switch. `false` makes the manga routes answer `503`, and the client shows no manga rows or results. |
| `MANGA_LANGUAGES` | `en` | Preferred chapter languages, comma-separated; the first is the default. Handed to the browser so its resolution picks the same language. |
| `MANGA_CONTENT_RATING` | `safe,suggestive,erotica` | Content ratings to include, comma-separated. Add `pornographic` to include it. Also handed to the browser. |

These name no host; they are reading preferences. See
[Backend environment](/reference/backend-env/#manga-reading-surface).

## Optional: a server-side provider (for devices that can't run the browser engine)

By default a visitor with **neither** the extension nor the proxy sees no chapters, just
as a video visitor with neither sees no streams. To let those devices (an old TV
browser, say) read anyway, inject a **private server-side manga provider** that
resolves on the backend.

It uses the same build-time overlay as the
[advanced backend-side E0 sources](/self-hosting/sources/#advanced-and-not-recommended-backend-side-e0-sources),
and the same `SOURCES_REPO` variable. If your private sources repository has a `manga/`
folder with a module that declares a module-level `MANGA_PROVIDER`, the build copies it
into the manga engine and the backend discovers it at boot. A build without one (the
default) has no provider, and the browser does the resolving.

With a provider present, the backend fills the chapter list on `/manga-overview`, serves
page images on `/read`, and relays those images same-origin through `GET /manga_proxy`.
That relay is **public and HMAC-signed** (an `<img>` can't carry an auth header) and
locked to MangaDex hosts, so it can never become an open proxy. Two provider-only
variables apply:

| Variable | Default | Description |
| --- | --- | --- |
| `MANGADEX_APP_NAME` | `CrimsonHaven/1.0` | The descriptive `User-Agent` the provider sends. Read only by the provider. |
| `MANGA_PROXY_SECRET` | unset | HMAC secret for `/manga_proxy` links, used only when `PROXY_SECRET` is unset. `PROXY_SECRET` always wins, so normally leave this out. Without either, links use a random per-process secret that breaks on restart and across replicas. |

:::danger[Lumi says: same trade-off as E0]
A server-side provider puts manga fetching back **on your server**, the exact thing the
browser-first design avoids. Like baking E0 video sources into the backend, your
server's IP touches a third-party host and you pay the bandwidth for the pages. Use it
only for a device that genuinely can't run the client engine. ( ˶ˆ ᗜ ˆ˶ )
:::

:::tip[Lumi says]
Keep that provider in your **private** repository, as with all sources. The public
backend ships no manga host and names none.
:::

## Recap

- Reading is an additive surface; anime, shows and movies are untouched.
- **AniList** for discovery (backend); **MangaDex** and **WeebCentral** for chapters and
  pages (browser).
- **No API key**, and page images never touch your backend.
- On by default; `MANGA_ENABLED=false` turns it off.
- A visitor reads client-side via the **extension (E3)** or **proxy (E2)**; an optional
  private **server-side provider** covers devices that can run neither.
