---
title: The music library
description: How Crimson Haven keeps your playlists for good. Import from Spotify (or a public link, or a CSV), download to a share you own, and play in the background like any music app.
---

Music is the one surface that keeps a copy. Each member imports their Spotify
playlists; the backend downloads every song onto a network share **you** own,
tags it with Spotify's metadata and cover, and plays it back in the PWA, in the
background, on the lock screen and over a car's Bluetooth. When Spotify drops a
song from a playlist, your copy stays. That is the reason it exists.

:::note[Off until you set it up, and granted per member]
Music needs a share (`MUSIC_ROOT`) and a **music provider** in the image. Without
the share the surface is dark. Without the provider, playlists import and sync
but nothing downloads. Like Lumi, every member needs an individual grant on
**Admin › Users**, because each one costs you disk and bandwidth.
:::

## How it fits together

| Part | Runs | Does |
| --- | --- | --- |
| `music_engine` | every api replica | the `/music` API, imports, signed playback links |
| `music-worker` | one service | matches, downloads and tags songs; resyncs playlists every six hours |
| music provider | inside the worker | where the audio comes from; an operator overlay, see below |
| the share | your NAS | the library itself, laid out for people rather than for this app |
| the player | the member's browser | one persistent `<audio>` element plus the Media Session API |

A song is stored once however many playlists (or members) hold it, and
**Admin › Music** lists the whole library that way: every song, whose playlists
hold it, its size, whether the CDN has a copy, and what is still waiting. The
track table doubles as the download queue:

| State | Meaning |
| --- | --- |
| `pending` | waiting for the worker |
| `working` | being matched or downloaded |
| `ready` | on the share, playable |
| `review` | the matcher was not sure; the member picks the recording in the app |
| `unmatched` | nothing looked like it; the member can search or paste a link |
| `failed` | the download broke; retryable from the app |

## Getting playlists in

| Way in | Reads | Syncs | Needs |
| --- | --- | --- | --- |
| Spotify Web API | private playlists, Liked Songs, every song, album and ISRC | yes | the member's own Spotify app (Premium) |
| Public link | public playlists, first 100 songs, no album | yes | the music provider |
| CSV | whatever the export holds | no | an [Exportify](https://exportify.app) file |
| Your own playlist | songs the member adds by search | no | the music provider |

A playlist of your own lives only in Crimson Haven. Its songs have no Spotify
metadata behind them, so they are tagged with the source's own track, artist
and cover where it has them, and with the search result's title and channel
where it does not. A result already in the library (say, matched for a Spotify
import) is reused, not downloaded again.

### Each member brings their own Spotify app

There is **no server-wide Spotify setting**. Spotify caps an app in development
mode to a handful of users who each have to be added by hand, and only lets
Premium accounts use its developer API at all. So each member creates a small
app (or is added to someone else's) and connects it from the Music page:

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard),
   ticking **Web API**.
2. Add the Redirect URI the Music page shows: `https://<your client>/music/connect`.
3. Paste the app's Client ID. There is no secret: the flow is Authorization Code
   with PKCE. The browser keeps the verifier; the backend gets the code once and
   keeps the refresh token.

The connection is read only (`playlist-read-private`, `playlist-read-collaborative`,
`user-library-read`). Playlists Spotify generates itself (Discover Weekly, Daily
Mix) are closed to apps registered after November 2024 and cannot be imported.

## The share

Mount it on **api** (which serves the files) and **music-worker** (which writes
them) at the same path, and point `MUSIC_ROOT` at it. For a Windows or Samba
share in Swarm:

```yaml
volumes:
  crimson_music:
    driver: local
    driver_opts:
      type: cifs
      device: "//nas.example.lan/crimsonmusic"
      o: "username=${NAS_USER},password=${NAS_PASSWORD},vers=3.0,uid=10001,gid=10001,file_mode=0664,dir_mode=0775"
```

`uid`/`gid` 10001 is the image's user. The library ends up like this:

```
Artist/Album/01 - Title.m4a       AAC, tagged, cover embedded
Artist/Album/cover.jpg
Artist/Singles/Title.m4a          no album known: each keeps its own Title.jpg
Playlists/<member>/<name>.m3u8    relative paths, so any player can open them
.incoming/                        work files, moved into place when done
```

Nothing is re-encoded when the source is already AAC. Names are cleaned to what
Windows accepts. Point Jellyfin or Navidrome at the same share if you like.

## An off-site copy on R2 (optional)

Set `MUSIC_CDN_URL` and `MUSIC_CDN_SECRET` and the music-worker copies every
song and cover to a Cloudflare R2 bucket, under the same paths as on the share.
Players then stream copied songs from your own domain instead of through the
api. A small Worker sits in front of the bucket, because R2's own pre-signed
URLs cannot be used on a custom domain: it checks the link's signature and
serves the file with Range support. Setup is in `deploy/music-cdn/README.md` in
the backend repository.

| Situation | What happens |
| --- | --- |
| first switched on | the existing library is copied, a few songs every ten seconds |
| a song is downloaded again | the new file is copied too |
| the CDN is down | copying pauses; songs not copied yet still play from the api |
| the share is lost | copied songs keep playing; `rclone copy` restores the share from the bucket |
| switched off | everything plays from the api again; the bucket stays |

## The music provider

The public backend never names a source. The provider is a module an operator
build bakes in, the same way as the [backend sources overlay](/self-hosting/sources/),
with its own variable:

| CI/CD variable | Value | Effect |
| --- | --- | --- |
| `MUSIC_REPO` | `your-group/your-music-provider` | Clones it at build time into `music_engine/`, installs its `requirements.txt` and adds Deno. **Unset ⇒ imports work, downloads wait.** |

The provider project must allow crimson-backend under **Settings › CI/CD › Job
token permissions**, exactly like `SOURCES_REPO`. It declares a module-level
`MUSIC_PROVIDER` with four methods: `match`, `search`, `fetch` and
`public_playlist` (see `music_engine/provider.py`).

## Playback

The player is one `<audio>` element that lives for the whole session, outside
the page components, so music keeps going across navigation and with the screen
off. The Media Session API hands Android the title, artist, cover and the play,
pause, skip and seek buttons, which is what the lock screen, the notification
shade and a car's Bluetooth display. The queue is saved per device, so the app
resumes where it stopped. Songs already on the device play from there, see
below.

Audio and covers are served from `/music_stream` and `/music_art`. Both are
outside the login wall, because an `<audio>` element cannot send a bearer token,
and each link is **HMAC signed and expires after a week**. Revoking someone's
grant therefore stops their old links within a week at most.

## On the device: preloading and offline

Both are per device and live in the browser's Cache Storage, keyed by track id
(a signed link changes every day, so it cannot be the key). The player plays a
song from the device when it is there and streams it only when it is not.

| Feature | What it does | Where |
| --- | --- | --- |
| Preload | keeps the next songs of the queue on the device, so a dead spot between songs does not stop playback | **Music › On this device**: Off, 3 (default), 5 or 10 songs |
| Download | keeps a whole playlist on the device, playable with no connection | **Download** on a playlist page; the button shows the size first |

How the pieces behave:

| Situation | What happens |
| --- | --- |
| the queue moves on | preloads outside the new window are dropped, the next songs fetched one at a time |
| a song is both downloaded and preloaded | it is fetched once, from downloads |
| a downloaded playlist changes on the server | opening it online, or starting the app online, fetches added songs and drops removed ones |
| no connection | Music lists the downloaded playlists and plays them; editing, sync and search need the server |
| a device copy is broken | that song streams instead |
| a download fails | it is retried the next time the app starts online |
| signing out | the queue, downloads and preloads are deleted from the device |

The service worker precaches every chunk of the current build, so the Music
pages open offline even if they were never visited online. A song counts once
however many downloaded playlists hold it. The browser is asked to keep the
storage persistent; an installed PWA on Android normally gets that without a
prompt.

:::caution[CDN operators: redeploy the Worker]
Downloads read songs with `fetch()`, which needs CORS. The api sends it for
`ALLOWED_ORIGINS` already; the music-cdn Worker sends
`Access-Control-Allow-Origin: *` from this release on, so run
`npx wrangler deploy` in `deploy/music-cdn` once. Until then, preloading and
downloading fail for songs on the CDN and they keep streaming as before.
:::

See [Backend environment](/reference/backend-env/#music) for the settings.
