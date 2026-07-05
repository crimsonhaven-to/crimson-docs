---
title: Operator-owned sources
description: Enable the three media sources the backend can serve directly — Local files, the server-side Cache, and your own Jellyfin server.
---

These are the only sources the **backend itself** serves, because they're media *you*
control — not third-party scraping. All three are optional and off until configured.

## Local — your own files

Play files from directories or NAS mounts you register, with seeking (HTTP Range)
support. Browser-native files (mp4 / m4v / mov / webm) play directly; with a source's
**encoding** toggle on, non-web containers (mkv / avi / ts / …) are transcoded to HLS on
the fly.

1. Make the media readable by the backend container — bind-mount your directory:
   ```yaml
   # in the backend service's docker-compose
   volumes:
     - /mnt/media:/media:ro
   ```
2. In the **admin dashboard → sources**, register the path (e.g. `/media`) and enable
   it. Optionally flip **encoding** on for that source to also play non-web containers
   (needs `ffmpeg`, which is in the image).
3. The backend matches a requested title/episode to a file by fuzzy-matching folder and
   filenames (it understands `S01E02`, `1x02`, `Season 2` folders, etc.). Matched files
   are served via `/local_proxy` (direct) or `/local_hls` (transcode).

It only surfaces when at least one local source is enabled, and re-checks bounds on
every request (no path traversal / symlink escapes).

:::tip[Lumi says: there's a whole shelf, not just a lookup]
Registering a Local source also lights up the **[local media library](/self-hosting/local-library/)** —
a browsable, searchable *Index view* of everything on those roots (with per-title pages
and watch progress), not just the on-demand title match above.
:::

## Cache — replay what was watched

The optional cache worker downloads a played stream (remuxed to mp4 with ffmpeg) onto a
NAS target you register, and replays it from disk as a named source — turning a flaky
remote stream into a fast local one over time.

1. Ensure **ffmpeg** is available (it's in the backend image).
2. Run the downloader on **one** replica: `RUN_CACHE_WORKER=true` there, `false`
   elsewhere. Tune with the `CACHE_*` variables (see [Backend environment](/reference/backend-env/)).
3. In the admin dashboard, enable caching and register a NAS target (with a display
   name). Played episodes are downloaded in the background and then appear as a source
   labelled with that target's name, served via `/cache_proxy`.

Caching is gated on actual playback (a few seconds), so a momentary open doesn't trigger
a download. Edge-offloaded / client-resolved streams are deliberately **not** cached
(that would pull the bytes back through the backend, defeating the offload).

## Jellyfin — your own media server

Stream from your own [Jellyfin](https://jellyfin.org/) server. The backend matches a
title by its TMDB id, picks direct-play or HLS, and injects the access token
**server-side** so it never reaches the browser.

```ini
JELLYFIN_URL=https://jellyfin.example.com      # reachable from the backend
JELLYFIN_USERNAME=crimson
JELLYFIN_PASSWORD=...
```

By default the backend proxies the stream (`/jellyfin_proxy`). To move those bytes off
the backend too, set `JELLYFIN_EDGE_INJECT=on` and deploy the
[proxy with `NITRO_JELLYFIN_*`](/reference/proxy-env/#edge-held-jellyfin-token-optional) —
the edge then injects the token and the bytes flow `Jellyfin → edge → viewer`.

:::tip[Lumi says]
These three are the legitimate exceptions to "the backend serves no streams": Local and
Cache are literally files on your own disk, and Jellyfin is your own server. They appear
in the admin **Source Health** view; nothing third-party does.
:::

## What about other secret-bound sources?

Some advanced setups run a source that needs a server-held secret, where the backend
does only the *resolve* (keeping the secret) and the client delivers the bytes, via the
`/resolve` grant. That wiring is operator-specific and configured purely through your
own private [sources engine](/self-hosting/sources/) plus the relevant secret in your
backend environment — it isn't part of the public stack, so it's intentionally not
enumerated here.
