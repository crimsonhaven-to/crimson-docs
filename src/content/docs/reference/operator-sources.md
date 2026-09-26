---
title: Operator-owned sources
description: Enable the three media sources the backend serves directly (Local files, the server-side Cache, and your own Jellyfin server).
---

These are the only sources the **backend itself** serves, because they are media *you*
control rather than third-party sites. All three are optional and off until configured.

## Local · your own files

Plays files from directories or NAS mounts you register, with seeking (HTTP Range).
Browser-native files (mp4, m4v, mov, webm) play directly. With a source's **encoding**
toggle on, non-web containers (mkv, avi, ts and others) are transcoded to HLS on the fly.

1. Bind-mount your media into the backend container so it can read it:
   ```yaml
   # in the backend service's docker-compose
   volumes:
     - /mnt/media:/media:ro
   ```
2. In **admin dashboard → sources**, register the path (e.g. `/media`) and enable it.
   Optionally turn **encoding** on for that source to also play non-web containers
   (needs `ffmpeg`, which is in the image).
3. The backend matches a requested title or episode to a file by fuzzy-matching folder
   and file names (it understands `S01E02`, `1x02`, `Season 2` folders and similar).
   Matched files are served via `/local_proxy` (direct) or `/local_hls` (transcode).

Local only appears when at least one local source is enabled. Every request re-checks
that the path stays inside the root, so path traversal and symlink escapes fail.

:::tip[Lumi says: there's a whole shelf, not just a lookup]
Registering a Local source also enables the **[local media library](/self-hosting/local-library/)**:
a browsable, searchable *Index view* of everything on those roots, with per-title pages
and watch progress.
:::

## Cache · replay what was watched

The optional cache worker downloads a played stream (remuxed to mp4 with ffmpeg) onto a
NAS target you register, then replays it from disk as a named source. Over time a flaky
remote stream becomes a fast local one.

1. Make sure **ffmpeg** is available (it is in the backend image).
2. Run the downloader on **one** replica: `RUN_CACHE_WORKER=true` there, `false`
   everywhere else. Tune it with the `CACHE_*` variables (see [Backend environment](/reference/backend-env/#operator-owned-sources)).
3. In the admin dashboard, enable caching and register a NAS target with a display
   name. Played episodes download in the background, then appear as a source labelled
   with that target's name, served via `/cache_proxy`.

Caching starts only after a few seconds of actual playback, so briefly opening a title
does not trigger a download. Edge-offloaded and client-resolved streams are **not**
cached on purpose: caching them would pull the bytes back through the backend and undo
the offload.

## Jellyfin · your own media server

Streams from your own [Jellyfin](https://jellyfin.org/) server. The backend matches a
title by its TMDB id, picks direct play or HLS, and injects the access token
**server-side** so it never reaches the browser.

```ini
JELLYFIN_URL=https://jellyfin.example.com      # reachable from the backend
JELLYFIN_USERNAME=crimson
JELLYFIN_PASSWORD=...
```

By default the backend proxies the stream (`/jellyfin_proxy`). To move those bytes off
the backend too, set `JELLYFIN_EDGE_INJECT=true` and deploy the
[proxy with `NITRO_JELLYFIN_*`](/reference/proxy-env/#edge-held-jellyfin-token-optional).
The edge then injects the token and the bytes flow `Jellyfin → edge → viewer`.

:::tip[Lumi says]
These three are the exceptions to "the backend serves no streams": Local and Cache are
files on your own disk, and Jellyfin is your own server. In the base build they are
the only sources in the admin **Source Health** view.
:::

## What about other secret-bound sources?

Some setups run a source that needs a server-held secret. The backend does only the
*resolve* (keeping the secret) and the client delivers the bytes, via the `/resolve`
grant. That wiring is operator-specific: it lives in your own private
[sources engine](/self-hosting/sources/) plus the matching secret in your backend
environment. It is not part of the public stack, so it is not listed here.
