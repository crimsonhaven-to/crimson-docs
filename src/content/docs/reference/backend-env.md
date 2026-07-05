---
title: Backend environment
description: Every environment variable the Crimson Haven backend reads, grouped by purpose, with defaults and guidance.
---

All backend configuration is via environment variables. The shipped
[`.env.example`](https://github.com/crimsonhaven-to/crimson-backend/blob/main/.env.example)
is the fully-commented source of truth; this page organises it.

:::caution[Containers don't auto-read .env]
Docker Compose / Swarm only inject variables **explicitly listed** in a service's
`environment:` block. The `.env` file is for `${...}` substitution, not auto-injection.
Recreate the container after changes.
:::

## Required

| Variable | Default | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | – | TMDB Read Access Token (v4) or legacy key. The one mandatory secret. |

## Database

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | – | Full PostgreSQL URL; takes precedence over the parts below. |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `localhost` / `5432` / `crimson` ×3 | Used to assemble the connection when `DATABASE_URL` is unset. |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `1` / `10` | Connection-pool sizing per replica. |
| `DB_CONNECT_TIMEOUT` | `30` | Seconds to wait at startup for the database. |
| `DB_PREPARE_THRESHOLD` | unset (off) | Server-side prepared statements. Leave **off** behind a transaction-mode PgBouncer. |

## Login wall & accounts

| Variable | Default | Description |
| --- | --- | --- |
| `REQUIRE_LOGIN` | `true` | Site-wide members-only wall. `false` reopens the whole API. |
| `SIGNUP_INVITE_CODE` | – | Reusable invite code(s), comma-separated, gating **both** account types. **Empty ⇒ signups closed** (`403`). |
| `ADMIN_EMAILS` | – | Comma-separated emails promoted to admin on startup. |
| `FRONTEND_BASE_URL` | `https://crimsonhaven.to` | Origin used to build emailed verify/reset links. |

See [Accounts & the login wall](/reference/accounts/) for the full model.

## SMTP (verification & reset email)

Only needed for **email + password** accounts. Unset `SMTP_HOST` disables sending
(registration still works; mail no-ops).

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | – | Mail server host; unset disables email. |
| `SMTP_PORT` | `587` | Mail server port. |
| `SMTP_SECURITY` | `starttls` | `starttls` \| `ssl` \| `none`. |
| `SMTP_USER` / `SMTP_PASSWORD` | – | Credentials. |
| `SMTP_FROM` / `SMTP_FROM_NAME` | – | Envelope + display sender. |

## Proxy signing & offload

| Variable | Default | Description |
| --- | --- | --- |
| `PROXY_SECRET` | random per-process | HMAC secret shared with [crimson-proxy](/self-hosting/proxy/). Signs `/sign` links, the subtitle proxy and cache tickets. **Must be stable + identical across replicas** and equal to each proxy's `NITRO_PROXY_SECRET`. `openssl rand -hex 32`. |
| `CRIMSON_PROXY_BASE` | – | Comma-separated edge proxy origin(s). Enables the `/sign` grant. Unset ⇒ `/sign` returns 503 and clients use the extension/backend. |

## Operator-owned sources

| Variable | Default | Description |
| --- | --- | --- |
| `JELLYFIN_URL` / `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` | – | Enable the Jellyfin source (your own server, reachable from the backend). |
| `JELLYFIN_EDGE_INJECT` | `off` | Deliver Jellyfin via the proxy edge (token injected at the edge) instead of the backend proxy. Requires the proxy's `NITRO_JELLYFIN_*`. |
| `RUN_CACHE_WORKER` | `true` | Run the background ffmpeg cache downloader on this replica. Set `true` on one dedicated worker only. |
| `CACHE_INTERNAL_BASE` / `CACHE_MAX_CONCURRENT` / `CACHE_DOWNLOAD_TIMEOUT` / `CACHE_MIN_FREE_BYTES` / `CACHE_QUEUE_MAX` | see `.env.example` | Cache downloader tuning. |

See [Operator-owned sources](/reference/operator-sources/) for setup.

## Manga (reading surface)

The reading surface is on by default and needs **no API key** — discovery is AniList,
and chapters/pages resolve in the viewer's browser. These are plain preferences (they
name no host); the last two are read only by an optional server-side provider.

| Variable | Default | Description |
| --- | --- | --- |
| `MANGA_ENABLED` | `true` | Master switch for the whole reading surface. `false` ⇒ the manga routes `503` and the client hides the row / search / reader. |
| `MANGA_LANGUAGES` | `en` | Preferred chapter language(s), comma-separated; first is the default. Handed to the browser so its resolution matches. |
| `MANGA_CONTENT_RATING` | `safe,suggestive,erotica` | Content ratings to include, comma-separated. Add `pornographic` to include it (off by default). |
| `MANGADEX_APP_NAME` | `CrimsonHaven/1.0` | **Provider-only.** Descriptive `User-Agent` for the optional server-side provider. |
| `MANGA_PROXY_SECRET` | falls back to `PROXY_SECRET` | **Provider-only.** Signs `/manga_proxy` image links. Reuse `PROXY_SECRET`. |

See [The reading surface (manga)](/self-hosting/manga/) for the full picture.

## Local media library

There is **nothing to switch on** — the browsable local library follows the Local
source (enable one in the admin dashboard). The only related variable is optional:

| Variable | Default | Description |
| --- | --- | --- |
| `LOCAL_PROXY_SECRET` | falls back to `PROXY_SECRET` | Signs the public `/local_art` poster image links. Reuse `PROXY_SECRET` (stable + identical across replicas); override only if you must. |

See [The local media library](/self-hosting/local-library/) for the full picture, and
[Operator-owned sources](/reference/operator-sources/#local--your-own-files) for the
Local source itself.

## Scaling & scheduling

| Variable | Default | Description |
| --- | --- | --- |
| `RUN_DB_SYNC` | `true` | Run the periodic Fribb mapping resync. **Exactly one replica** should have this `true`. |
| `ALLOWED_ORIGINS` | built-in list | Comma-separated CORS origins. Lock down in production. |
| `RATE_LIMIT_STORAGE_URI` | `memory://` | Rate-limit backend; `redis://…` to share limits across replicas. |
| `FORWARDED_ALLOW_IPS` | – | Trusted proxy IPs uvicorn honours `X-Forwarded-*` from. Usually `*` behind a reverse proxy. |
| `METADATA_REFRESH_*` / `RUN_METADATA_BACKFILL` / `METADATA_BACKFILL_PAGES` | see `.env.example` | Non-anime metadata maintenance (pinned to the sync replica). |

## Optional integrations (each self-disables when unset)

| Variable(s) | Feature |
| --- | --- |
| `DISCORD_BOT_TOKEN` / `DISCORD_OWNER_ID` / `DISCORD_COMMAND_PREFIX` | The [Discord invite bot](/reference/accounts/#the-discord-invite-bot) (`python -m discord_bot`). |
| `KOFI_VERIFICATION_TOKEN` / `KOFI_ACTIVE_WINDOW_DAYS` / `KOFI_LIST_CACHE_TTL` | Ko-fi supporters list (`/supporters`). |
| `GITHUB_TOKEN` / `GITHUB_REPO` / `CHANGELOG_*` | Public changelog from GitHub Releases (`/changelog`). |
| `OPENSUBTITLES_API_KEY` / `OPENSUBTITLES_APP_NAME` / `SUBTITLES_*` | OpenSubtitles player tracks (`/subtitles`). |
| `HEALTH_CANARY_*` | The admin Source-Health probe target. |
| `DEBUG` | When truthy, includes exception detail in 500 responses. **Leave unset in production.** |

:::tip[Lumi says]
Start with just `TMDB_API_KEY`, the database, `SIGNUP_INVITE_CODE` and `PROXY_SECRET`.
Add the rest as you turn features on — none of the optional blocks are needed to boot.
:::
