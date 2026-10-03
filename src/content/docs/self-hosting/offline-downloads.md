---
title: Offline downloads (movies and shows)
description: How members keep movies, shows and anime on their device and watch them without a connection, resolved in their own browser with the source they pick.
---

Members can keep a movie, an episode or the rest of a season on their device and
watch it later with no connection, the same way downloaded music playlists work.
Nothing about it runs on your servers: the link is resolved in the member's
browser by the same engine and backend merge the watch page uses, and the video
goes from the source's CDN straight into the browser's storage.

:::note[Nothing to configure]
It ships with the client and needs no backend setting. It needs a browser with
Cache Storage (every current browser) and works best as an installed PWA, which
browsers rarely evict.
:::

## For members

| Step | Where |
| --- | --- |
| Save | **Save offline** beside the watchlist button on any movie, show or anime watch page |
| Pick the source | the dialog lists every source the page resolved that hands over a video file; embeds cannot be saved |
| Pick how much | shows and anime: **This episode** or **This and the next N** (the aired episodes after it in the season) |
| Watch | **Downloads** in the navigation, or the **Saved** button on the watch page |

The Downloads page lists every title with its episodes, the source each came
from, the size, the progress of the running download, and Retry and Remove
buttons. The offline player resumes where the member stopped, offers the next
saved episode, and plays the subtitles that were saved with the copy.

## How it works

| Step | What happens |
| --- | --- |
| 1. Save | The page hands over the stream the member picked plus, per episode, what it takes to resolve it again later: the backend `/watch` path and the engine's media context |
| 2. Queue | One download at a time, oldest first, kept in `localStorage` (`crimson:video-downloads`) |
| 3. Link | The episode on screen uses the link the page already has. Every other one is resolved right before it starts, engine and backend side by side, local line winning |
| 4. Match | The same source label and language as the member's pick; failing that, another server of the same provider in the same language. Never a different language |
| 5. Fetch | HLS: the best variant (and its separate audio rendition, if any), every segment fetched four at a time and AES-128 decrypted. MP4: streamed to disk |
| 6. Store | Cache Storage `crimson-video-downloads`, keys under `/video-offline/<id>/`, never the source URL (signed links expire) |
| 7. Play | HLS through hls.js with a loader that reads the cache; MP4 and subtitles as object URLs of the stored blobs |

An HLS copy is kept as one cache entry per segment plus rewritten playlists
without keys or byte ranges, so it never has to sit in memory as a whole. Ids
are `movie-<tmdb>`, `tv-<tmdb>-s<season>-e<episode>` and
`anime-<season anilist id>-e<episode>`.

### Why the queue waits for the player

The companion's header rules (Referer, CORS) are per tab, and every resolve
clears them. A background resolve would cut off the CDN of the video the member
is watching, and a watch page's resolve cuts off a running download. So:

| Situation | Behaviour |
| --- | --- |
| a watch page is open | the queue resolves nothing; Downloads shows why |
| a running download's link dies (403, rules cleared, expired) | it waits until no player is open, resolves a fresh link and resumes from the segment it reached |
| the fresh link is cut differently or comes from another server | the kept segments are dropped and the episode starts over |
| a link fails three times with nobody watching and a connection up | the episode is marked failed with the reason; **Retry** queues it again |
| no space left, or encryption other than AES-128 | failed at once, retrying would not help |
| no connection | the queue waits for the `online` event |
| the tab closes | the next app start resumes it |
| sign out | the list and every copy are deleted from the device |

The watch pages register themselves through `streamLocalSources` (their abort
signal stays live while they play); the queue passes `background: true` so its
own resolves do not count.

## Limits

- Downloads run in the open tab. There is no background download once it is closed.
- Iframe sources (third-party embed players) never expose a file and cannot be saved.
- Offline playback position is kept on the device only; it is not synced to the account's history.
- Safari without MediaSource plays HLS copies natively through the service worker,
  so on iOS the copy plays only once the worker is active (not after a hard reload).

## Files

| File | Role |
| --- | --- |
| `src/offline/SaveOffline.jsx` | The button and the source and scope dialog |
| `src/offline/queue.js` | The run loop: fresh links, waiting for the player, retries, removal, sign out |
| `src/offline/resolve.js` | Background resolve and source matching |
| `src/offline/storeVideo.js` | Fetching a stream into the cache, resumable per segment |
| `src/offline/localPlaylist.js` | The rewritten playlists of a copy |
| `src/offline/videoStore.js` | Cache Storage keys and access |
| `src/offline/store.js` | The persisted list and live progress |
| `src/offline/CacheLoader.js` | The hls.js loader that reads the cache |
| `src/offline/Downloads.jsx`, `OfflineWatch.jsx` | `/downloads` and `/downloads/watch/:id` |
| `src/watch/hlsPlaylist.js` | HLS parsing and decryption, shared with the player's one-shot file download |

The CSP allows `blob:` in `img-src` for offline posters; `media-src blob:` already
covered the video and subtitles. The service worker keeps `crimson-video-*`
caches across updates and serves `/video-offline/` from them.
