---
title: Backend environment
description: Every environment variable the Crimson Haven backend reads, grouped by purpose, with defaults.
---

All backend configuration is via environment variables. The shipped
[`.env.example`](https://gitlab.ramon.moe/crimsonhaven-to/crimson-backend/-/blob/main/.env.example)
is the commented source of truth; this page groups it by purpose. Booleans accept
`true`/`false`, `1`/`0`, `yes`/`no` and `on`/`off`; lists are comma-separated.

:::caution[Containers don't auto-read .env]
Docker Compose and Swarm inject only the variables **explicitly listed** in a service's
`environment:` block. The `.env` file is for `${...}` substitution, not injection.
Recreate the container after changes.
:::

## Required

| Variable | Default | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | unset | TMDB Read Access Token (v4) or legacy key. The only mandatory secret. |

## Database

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | unset | Full PostgreSQL URL; takes precedence over the parts below. |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `localhost` / `5432` / `crimson` ×3 | Used to build the connection when `DATABASE_URL` is unset. |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `1` / `10` | Connection-pool size per replica. |
| `DB_CONNECT_TIMEOUT` | `30` | Seconds to wait at startup for the database. |
| `DB_PREPARE_THRESHOLD` | unset (off) | Server-side prepared statements. Leave **off** behind a transaction-mode PgBouncer. |

## Login wall & accounts

| Variable | Default | Description |
| --- | --- | --- |
| `REQUIRE_LOGIN` | `true` | Site-wide members-only wall. `false` opens the whole API. |
| `SIGNUP_INVITE_CODE` | unset | Reusable invite code(s), comma-separated, for **both** account types. **Empty closes shared-code signup** (`403`); single-use invites still work. |
| `ADMIN_EMAILS` | unset | Comma-separated emails of existing accounts to promote to admin on startup. |
| `FRONTEND_BASE_URL` | `https://crimsonhaven.to` | Origin used in emailed verify and reset links and the Discord bot's signup hint. |
| `SECURITY_EVENTS_RETENTION_DAYS` | `90` | How long the [security ledger](/reference/accounts/#the-security-ledger) (Admin › Security) keeps events before the housekeeping sweep prunes them. |
| `DEMO_MODE` | `false` | Open signup with no invite code, and wipe every non-admin account nightly. |
| `DEMO_RESET_HOUR` | `4` | Hour (UTC, `0` to `23`) of the nightly demo wipe. |

See [Accounts & the login wall](/reference/accounts/) for the full model.

## SMTP (verification & reset email)

Needed only for **email + password** accounts and the optional
[airing notifications](/self-hosting/airing-calendar/). With `SMTP_HOST` unset no mail
is sent: registration still works, but verification and password-reset mails do not
go out.

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | unset | Mail server host; unset disables email. |
| `SMTP_PORT` | `587` | Mail server port. |
| `SMTP_SECURITY` | `starttls` | `starttls` \| `ssl` \| `none`. |
| `SMTP_USER` / `SMTP_PASSWORD` | unset | Credentials. |
| `SMTP_FROM` / `SMTP_FROM_NAME` | unset / `CrimsonHaven` | Envelope sender and display name. |

## Proxy signing & offload

| Variable | Default | Description |
| --- | --- | --- |
| `PROXY_SECRET` | unset (random per process) | HMAC secret shared with [crimson-proxy](/self-hosting/proxy/). Signs `/sign` links, the subtitle, IPTV and music proxies, `/local_art` and cache tickets. **Must be stable, identical on every replica** and equal to each proxy's `NITRO_PROXY_SECRET`. The random fallback only works for a single dev instance. Generate with `openssl rand -hex 32`. |
| `SUBTITLES_PROXY_SECRET` / `CACHE_TICKET_SECRET` | unset | Per-feature secrets, read only when `PROXY_SECRET` is unset. The other per-feature secrets are listed in their sections below. |
| `CRIMSON_PROXY_BASE` | unset | Comma-separated edge proxy origin(s). Enables the `/sign` grant. Unset: `/sign` returns `503` and clients use the extension or the backend. |

## Operator-owned sources

| Variable | Default | Description |
| --- | --- | --- |
| `JELLYFIN_URL` / `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` | unset | Enable the Jellyfin source (your own server, reachable from the backend). |
| `JELLYFIN_EDGE_INJECT` | `false` | Deliver Jellyfin through the proxy edge (token injected at the edge) instead of the backend proxy. Requires the proxy's `NITRO_JELLYFIN_*`. |
| `RUN_CACHE_WORKER` | `true` | Run the background ffmpeg cache downloader on this replica. Keep it `true` on one dedicated worker and set `false` everywhere else. |
| `CACHE_INTERNAL_BASE` / `CACHE_MAX_CONCURRENT` / `CACHE_DOWNLOAD_TIMEOUT` / `CACHE_POLL_INTERVAL` / `CACHE_MIN_FREE_BYTES` | see `.env.example` | Cache downloader tuning. |
| `PRIVATE_SOURCES_ENABLED` | `true` | Kill switch for build-time overlay [sources](/self-hosting/sources/). `false` disables them without a rebuild. |

See [Operator-owned sources](/reference/operator-sources/) for setup.

## Background downloads (aria2)

Admin downloads go through an aria2 sidecar into a download-enabled Local source.

| Variable | Default | Description |
| --- | --- | --- |
| `RUN_DOWNLOAD_WORKER` | `true` | Run the aria2 poll loop on this replica. Keep it `true` on one dedicated service and set `false` elsewhere. |
| `ARIA2_RPC_URL` | `http://aria2:6800/jsonrpc` | aria2 JSON-RPC endpoint. |
| `ARIA2_RPC_SECRET` | unset | Must equal aria2's `RPC_SECRET`. Generate with `openssl rand -hex 24`. |
| `DOWNLOAD_MAX_ACTIVE` / `DOWNLOAD_POLL_INTERVAL` / `DOWNLOAD_MIN_FREE_BYTES` | `3` / `5` / `2147483648` | Concurrent downloads, poll interval in seconds, and free space (bytes) to keep on the target. |

## Manga (reading surface)

The reading surface is on by default and needs **no API key**: discovery is AniList,
and chapters and pages resolve in the viewer's browser. The first three variables are
plain preferences (they name no host); the last two are read only by an optional
server-side provider.

| Variable | Default | Description |
| --- | --- | --- |
| `MANGA_ENABLED` | `true` | Master switch for the reading surface. `false`: the manga routes return `503` and the client hides the row, search and reader. |
| `MANGA_LANGUAGES` | `en` | Preferred chapter language(s), comma-separated; the first is the default. Passed to the browser so its resolution matches. |
| `MANGA_CONTENT_RATING` | `safe,suggestive,erotica` | Content ratings to include, comma-separated. Add `pornographic` to include it (off by default). |
| `MANGADEX_APP_NAME` | `CrimsonHaven/1.0` | **Provider only.** Descriptive `User-Agent` for the optional server-side provider. |
| `MANGA_PROXY_SECRET` | unset | **Provider only.** Signs `/manga_proxy` image links, read only when `PROXY_SECRET` is unset. |

See [The reading surface (manga)](/self-hosting/manga/) for the full picture.

## Local media library

There is **nothing to switch on**: the browsable local library follows the Local
source (enable one in the admin dashboard). The only related variable is optional:

| Variable | Default | Description |
| --- | --- | --- |
| `LOCAL_PROXY_SECRET` | unset | Signs the public `/local_art` poster links, read only when `PROXY_SECRET` is unset. Set `PROXY_SECRET` instead. |

See [The local media library](/self-hosting/local-library/) for the full picture, and
[Operator-owned sources](/reference/operator-sources/#local--your-own-files) for the
Local source itself.

## Live TV (IPTV)

The Live TV surface is on by default and needs **no API key**. The catalogue is the
[iptv-org](https://github.com/iptv-org/iptv) public index, fetched twice daily into
memory (no database table). Playback is direct first; the signed `/iptv_proxy` carries
only what the browser's own rules will not allow.

| Variable | Default | Description |
| --- | --- | --- |
| `IPTV_ENABLED` | `true` | Master switch for Live TV. `false`: the IPTV routes return `503` and the client hides the nav entry and routes. |
| `IPTV_REFRESH_HOURS` | `12` | Hours between catalogue refreshes (upstream publishes daily). Minimum `1`. |
| `IPTV_INCLUDE_NSFW` | `false` | Include NSFW-flagged channels in the catalogue. |
| `IPTV_PROXY_SECRET` | unset | Signs `/iptv_proxy` stream links, read only when `PROXY_SECRET` is unset. Set `PROXY_SECRET` instead. |

See [The Live TV surface (IPTV)](/self-hosting/live-tv/) for the full picture.

## Music

Off until a share is mounted. Spotify is **not** configured here: each member
connects their own Spotify app from the Music page, and access is granted per
member on **Admin › Users**.

| Variable | Default | Description |
| --- | --- | --- |
| `MUSIC_ROOT` | unset | In-container path of the music share, e.g. `/crimson/music`. Unset hides the Music surface. Mount it on api and music-worker alike. |
| `RUN_MUSIC_WORKER` | `true` | Run the music download and playlist sync loop. `true` on the music-worker service only. |
| `MUSIC_LINK_SECRET` | unset | Signs `/music_stream` and `/music_art` links, read only when `PROXY_SECRET` is unset. Set `PROXY_SECRET` instead. |
| `MUSIC_CDN_URL` | unset | Base URL of the music-cdn Worker, e.g. `https://cdn.example.com`. With `MUSIC_CDN_SECRET`, songs are copied to R2 and streamed from there. Set on api and music-worker. |
| `MUSIC_CDN_SECRET` | unset | Shared with the Worker's `CDN_SECRET`: signs CDN links and authorises uploads. |

Downloads also need a music provider baked into the image (`MUSIC_REPO` at build
time). See [The music library](/self-hosting/music/) for the full picture.

## Airing calendar & notifications

The weekly calendar and per-title follows are **always on** and need nothing here.
These two gate only the job that emails a member when a followed episode airs. It
also needs `SMTP_*` above and runs only on the `RUN_DB_SYNC` replica.

| Variable | Default | Description |
| --- | --- | --- |
| `AIRING_NOTIFY_ENABLED` | `false` | Send the "a new episode aired" mail. Off by default because a sent mail is the one thing a redeploy cannot take back. |
| `AIRING_NOTIFY_DRY_RUN` | `false` | Rehearsal: claims each notice for real and logs who *would* be mailed, without opening an SMTP connection. |

Only accounts with a **verified** email are mailed, so mnemonic accounts are skipped
(the API reports this via `email_notifications` rather than failing the follow).

See [The airing calendar & follows](/self-hosting/airing-calendar/) for the full
picture, including why to rehearse with the dry run first.

## Lumi, the chatbot

Optional and off by default. **Only the provider keys are environment variables.**
The master switch, provider, model, budgets and per-account grants are operator state
in PostgreSQL, managed from **Admin › Lumi** and **Admin › Users** without a redeploy.
Keys stay out of the database so a database dump never carries billable credentials.

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Claude. The recommended provider (best persona fidelity and tool accuracy). |
| `GEMINI_API_KEY` | unset | Google AI Studio. `GOOGLE_API_KEY` is accepted as an alias. |

Setting a key does **not** turn the feature on, and turning it on does not give anyone
access: both are separate, audited decisions in the dashboard.

See [Lumi, the chatbot](/self-hosting/lumi/) for the full picture.

## Scaling & scheduling

| Variable | Default | Description |
| --- | --- | --- |
| `RUN_DB_SYNC` | `true` | Run the periodic Fribb mapping resync, the nightly metadata jobs and the [airing](/self-hosting/airing-calendar/) refresh and notify jobs. **Exactly one replica** should have this `true`. |
| `ALLOWED_ORIGINS` | `https://crimsonhaven.to,https://www.crimsonhaven.to` | Comma-separated CORS origins. Set your own in production. |
| `RATE_LIMIT_STORAGE_URI` | `memory://` | Rate-limit backend. In-memory limits are per replica; use `redis://…` to share them. |
| `METADATA_REFRESH_BUCKETS` / `METADATA_REFRESH_HOUR` | `14` / `4` | Nightly TMDB refresh: re-pull the oldest 1/buckets of the TMDB tables at this hour. Sync replica only. |
| `RUN_METADATA_BACKFILL` / `METADATA_BACKFILL_PAGES` | `false` / `100` | Pre-populate from TMDB discover at startup. Also available from the dashboard. |

## Optional integrations (each self-disables when unset)

| Variable(s) | Feature |
| --- | --- |
| `DISCORD_BOT_TOKEN` / `DISCORD_OWNER_ID` / `DISCORD_COMMAND_PREFIX` | The [Discord invite bot](/reference/accounts/#the-discord-invite-bot) (`python -m discord_bot`). |
| `KOFI_VERIFICATION_TOKEN` / `KOFI_ACTIVE_WINDOW_DAYS` / `KOFI_LIST_CACHE_TTL` | Ko-fi supporters list (`/supporters`). |
| `GITHUB_TOKEN` / `GITHUB_REPO` / `CHANGELOG_*` | Public changelog from GitHub Releases (`/changelog`). |
| `OPENSUBTITLES_API_KEY` / `OPENSUBTITLES_APP_NAME` / `SUBTITLES_SEARCH_TTL` | OpenSubtitles player tracks (`/subtitles`). |
| `HEALTH_CANARY_*` | The title the admin Source Health view probes with. |
| `METRICS_TOKEN` | Lets a Prometheus scrape reach `/metrics`. Unset: admin sessions only. |
| `PROMETHEUS_URL` | History charts on the dashboard's Metrics tab. |
| `LOG_FORMAT` | `plain` (default) or `json`. |
| `DEBUG` | When truthy, includes exception detail in 500 responses. **Leave unset in production.** |

:::tip[Lumi says]
Start with `TMDB_API_KEY`, the database, `SIGNUP_INVITE_CODE` and `PROXY_SECRET`.
Add the rest as you turn features on; none of the optional blocks is needed to boot.
:::
