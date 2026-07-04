---
title: The reading surface (manga)
description: How Crimson Haven's manga reading surface works — AniList discovery on the backend, MangaDex resolved in the viewer's browser, the reader, and the optional server-side provider.
---

Crimson Haven isn't only for watching. Alongside anime, shows and movies there is a
fourth, **additive** content surface: **reading**. It behaves exactly like the video
surfaces — the same login wall, the same favorites, the same "continue where you left
off" — but the unit is a *chapter of pages*, not a stream.

It follows the very same principle as everything else: **the backend never talks to a
manga host.** Discovery and metadata come from AniList (public metadata, like TMDB for
video), and the chapter list and page images are resolved in the **viewer's own
browser** by your sources engine — so no manga content ever flows through your server.

:::note[Additive, and off nobody's path]
The reading surface is purely additive. Anime, shows and movies are untouched — manga
gets its own trending row, its own search results and its own reader. If you'd rather
not offer it at all, one switch (`MANGA_ENABLED=false`) hides the whole thing.
:::

## Where the work happens

Reading splits along the same seam as the [New System](/architecture/new-system/):

| Step | Where it runs | Why |
| --- | --- | --- |
| **Discovery + metadata** (trending, search, covers, synopsis) | **Backend** (AniList) | Public metadata — the same place the anime surface already draws from. Names no manga host. |
| **Chapter list** (which chapters exist, in which language) | **Viewer's browser** | Comes from MangaDex, which the public backend never contacts. |
| **Page images** | **Viewer's browser → `<img>`** | Raw MangaDex CDN URLs, loaded straight into an `<img>`. Image loads aren't subject to CORS, so **no proxy touches the bytes**. |

MangaDex's API is **free and key-less** — you never need an API key. Its JSON API does
*not* answer CORS for a third-party origin, so the three lookups (search → chapter feed
→ page server) need a CORS bypass — a "plain-CORS discovery" source in New-System terms
(constraint **C1**). They route through the **companion extension (E3)** or the **edge
proxy (E2)**, exactly like a header-only video source. The page images themselves need
nothing: they're raw `*.mangadex.network` URLs an `<img>` loads directly.

:::tip[Lumi says]
So reading is the video model, applied to pictures instead of streams. The backend
stays the brain (AniList metadata, accounts, progress); the finding-and-fetching lives
in the browser; and the heaviest part — the page images — never even needs the proxy.
The bandwidth bill barely notices. ( ˶ ˆ ᗜ ˆ ˶ )
:::

### What the client engine exposes

Your bundled sources engine (`crimson-sources`) provides a small, self-contained
sibling of the video engine for reading — it is **not** part of `streamEpisode`, since
its unit is a chapter, not a stream:

```ts
import { createMangaEngine, getExtensionBridge } from "crimson-sources";

const manga = await createMangaEngine({ extension: getExtensionBridge(), signProxyUrl });
if (manga.available) {                                  // else leave it to the backend
  const id       = await manga.resolveManga(candidateTitles, contentRating);
  const chapters = await manga.chapters(id, "en", contentRating);
  const pages    = await manga.pages(chapters[0].id);   // raw @Home URLs for <img>
}
```

`available` is `false` when neither the extension (E3) nor a configured proxy (E2) can
run — so a visitor with neither simply sees no chapters (unless you run the optional
server-side provider below). Never a hard failure; the page always renders its metadata.

The no-op stub the client falls back to when you bundle no sources also implements this,
so a sources-free build still compiles and simply shows no chapters. See
[Adding your own sources](/self-hosting/sources/).

## The backend's role (metadata + orchestration only)

The public backend exposes a handful of reading routes. Discovery is pure AniList; the
overview hands the browser everything it needs to resolve the chapters itself:

| Route | What it does |
| --- | --- |
| `GET /trending/manga` | Trending manga (AniList). |
| `GET /search/manga` | Manga search (AniList) — also folded into unified search. |
| `GET /manga-overview/{anilist_id}` | AniList metadata **plus** the candidate titles + language + content-rating the browser needs to resolve the chapter list. On a base build the chapter list is empty (the browser fills it). |
| `GET /read/{anilist_id}/{chapter_id}` | A chapter's page images — **only** on a build with the server-side provider (below); otherwise the browser resolves the pages. |
| `GET /manga_proxy` | Signed same-origin image relay — **only** with the provider; dormant otherwise. |

The AniList→MangaDex id mapping and the chapter list are cached in the backend's
response cache (no database table), so **the reading surface needs no migration** — it
works the moment you deploy.

## The reader

The reader is built to feel like the video player, for pages:

- **Two modes** — a webtoon-style **vertical long-strip** (the default, great for
  webtoons *and* manga) and a **single-page paged** mode with **right-to-left** support
  (manga reads RTL). Your choice is remembered.
- **Launches inline** (the site nav stays visible) with a full control bar — a page
  **scrubber**, page counter, previous/next **page** and previous/next **chapter**, plus
  the mode / RTL / fullscreen toggles. A slim header carries the title, the current
  chapter and a chapter picker.
- **True fullscreen** via the browser's Fullscreen API. The chrome auto-hides while you
  read and re-reveals on mouse-move or scroll-up — and a small **exit** button is always
  present in fullscreen, so you can never get stuck. Keyboard: `F` toggles fullscreen,
  the arrows page (respecting RTL), `Esc` exits.
- **Continue reading.** Progress is saved as you read, and "Continue" — from the
  overview *or* the Recently-Watched row — drops you straight back onto the right
  chapter and page.
- **Favorites.** A manga can be saved to any of your lists, right beside your anime,
  shows and movies. A distinct little tag on every card keeps the four kinds apart at a
  glance.

Reading progress and favorites **reuse the existing account tables** (a manga is stored
under a `manga:` namespace, with the chapter riding in the episode field and the page in
the position field), so continue-reading and cross-device sync came for free — again,
no schema change.

## Configuration

Everything here is optional; the surface is on by default.

| Variable | Default | Description |
| --- | --- | --- |
| `MANGA_ENABLED` | `true` | Master switch for the whole reading surface. `false` ⇒ the manga routes return `503` and the client hides the trending row, search results and reader. |
| `MANGA_LANGUAGES` | `en` | Preferred chapter language(s), comma-separated; the first is the default. Handed to the browser so its own resolution surfaces the same language. |
| `MANGA_CONTENT_RATING` | `safe,suggestive,erotica` | Content ratings to include, comma-separated. Add `pornographic` to include it — off by default. Also handed to the browser. |

These name no host — they're plain reading preferences. See
[Backend environment](/reference/backend-env/#manga-reading-surface).

## Optional: a server-side provider (for devices that can't run the browser engine)

By default, a visitor with **neither** the extension nor the proxy sees no chapters —
just like a video visitor with neither sees no streams. If you want *those* devices (an
old TV browser, say) to read anyway, you can inject a **private server-side manga
provider**, resolved on the backend.

This uses the **exact same build-time overlay** as the
[advanced backend-side E0 sources](/self-hosting/sources/#advanced-and-not-recommended-backend-side-e0-sources)
— the same `SOURCES_REPO` / `SOURCES_PAT` secrets. If your private sources repository
contains a `manga/` folder with a module that declares a module-level `MANGA_PROVIDER`,
the backend build copies it into the manga engine and discovers it at boot. A build
without it (the default) simply has no provider, and the browser does the resolving.

When a provider is present it fills the chapter list on `/manga-overview`, serves page
images on `/read`, and relays those images same-origin through `GET /manga_proxy` — a
**public, HMAC-signed** relay (an `<img>` can't carry an auth header), locked to
MangaDex hosts so it can never become an open proxy. Two provider-only variables apply:

| Variable | Default | Description |
| --- | --- | --- |
| `MANGADEX_APP_NAME` | `CrimsonHaven/1.0` | The descriptive `User-Agent` the provider sends. Read only by the provider. |
| `MANGA_PROXY_SECRET` | falls back to `PROXY_SECRET` | HMAC secret that signs `/manga_proxy` image links. Reuse `PROXY_SECRET` (stable + identical across replicas); override only if you must. |

:::danger[Lumi says: same trade-off as E0]
A server-side provider puts the manga fetching back **on your server** — the exact thing
the browser-first design avoids. It's the reading twin of baking E0 video sources into
the backend, and carries the same costs: your server's IP touches a third-party host, and
you pay the bandwidth for the pages. Reach for it only for the narrow case it's meant for
— a device that genuinely can't run the client engine — and otherwise let the browser do
the reading. ( ˶ˆ ᗜ ˆ˶ )
:::

:::tip[Lumi says]
As with all sources, keep that provider in your **private** repository. The public
backend ships no manga host and names none — the door is only mentioned here.
:::

## Recap

- Reading is a fourth, additive surface — anime/shows/movies are untouched.
- **AniList** for discovery (backend); **MangaDex** for chapters and pages (browser).
- **No API key**, and page images never touch your backend (raw `<img>` URLs).
- On by default; `MANGA_ENABLED=false` turns it off entirely.
- A visitor reads client-side via the **extension (E3)** or **proxy (E2)**; an optional
  private **server-side provider** covers devices that can run neither.
