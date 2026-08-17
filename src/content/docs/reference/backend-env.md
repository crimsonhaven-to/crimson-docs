---
title: Backend environment
description: Every environment variable the Crimson Haven backend reads, grouped by purpose, with defaults and guidance.
---

All backend configuration is via environment variables. The shipped
[`.env.example`](https://github.com/crimsonhaven-to/crimson-backend/blob/main/.env.example)
is the fully-commented source of truth for the blocks it covers; this page organises it
and fills in the newer variables (Live TV, observability, demo mode) it hasn't caught
up with yet.

:::caution[Containers don't auto-read .env]
Docker Compose / Swarm only inject variables **explicitly listed** in a service's
`environment:` block. The `.env` file is for `${...}` substitution, not auto-injection.
Recreate the container after changes.
:::

## Required

| Variable | Default | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | none | TMDB Read Access Token (v4) or legacy key. The one mandatory secret. |

## Database

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | none | Full PostgreSQL URL; takes precedence over the parts below. |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `localhost` / `5432` / `crimson` ×3 | Used to assemble the connection when `DATABASE_URL` is unset. |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `1` / `10` | Connection-pool sizing per replica. |
| `DB_CONNECT_TIMEOUT` | `30` | Seconds to wait at startup for the database. |
| `DB_PREPARE_THRESHOLD` | unset (off) | Server-side prepared statements. Leave **off** behind a transaction-mode PgBouncer. |

## Login wall & accounts

| Variable | Default | Description |
| --- | --- | --- |
| `REQUIRE_LOGIN` | `true` | Site-wide members-only wall. `false` reopens the whole API. |
| `SIGNUP_INVITE_CODE` | none | Reusable invite code(s), comma-separated, gating **both** account types. **Empty ⇒ signups closed** (`403`). |
| `ADMIN_EMAILS` | none | Comma-separated emails promoted to admin on startup. |
| `FRONTEND_BASE_URL` | `https://crimsonhaven.to` | Origin used to build emailed verify/reset links. |
| `SECURITY_EVENTS_RETENTION_DAYS` | `90` | How long the [security ledger](/reference/accounts/#the-security-ledger) (Admin › Security: auth denials, rate-limit trips, admin actions) keeps events before the housekeeping sweep prunes them. |

See [Accounts & the login wall](/reference/accounts/) for the full model.

## SMTP (verification & reset email)

Only needed for **email + password** accounts. Unset `SMTP_HOST` disables sending
(registration still works; mail no-ops).

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | none | Mail server host; unset disables email. |
| `SMTP_PORT` | `587` | Mail server port. |
| `SMTP_SECURITY` | `starttls` | `starttls` \| `ssl` \| `none`. |
| `SMTP_USER` / `SMTP_PASSWORD` | none | Credentials. |
| `SMTP_FROM` / `SMTP_FROM_NAME` | none / `CrimsonHaven` | Envelope + display sender. |

## Proxy signing & offload

| Variable | Default | Description |
| --- | --- | --- |
| `PROXY_SECRET` | random per-process | HMAC secret shared with [crimson-proxy](/self-hosting/proxy/). Signs `/sign` links, every media/image proxy and the cache tickets. **Must be stable + identical across replicas** and equal to each proxy's `NITRO_PROXY_SECRET`. `openssl rand -hex 32`. |
| `CRIMSON_PROXY_BASE` | none | Comma-separated edge proxy origin(s). Enables the `/sign` grant. Unset ⇒ `/sign` returns 503 and clients use the extension/backend. |
| `CRIMSON_PROXY_SOURCES` | none (all) | Optional per-source allow-list for the edge path, comma-separated. Empty means every source may use the proxy. Handy for A/B testing one source across the edge. |

:::caution[The per-surface secrets are fallbacks, not overrides]
Several surfaces below list their own `*_PROXY_SECRET`. Each resolves as
`PROXY_SECRET or <the specific one>`, so **`PROXY_SECRET` always wins when it is
set** and the per-surface variable is read only when it is empty. Setting one
alongside `PROXY_SECRET` does nothing. Set `PROXY_SECRET` and leave the rest alone
unless you deliberately want each surface keyed separately.
:::

## Operator-owned sources

| Variable | Default | Description |
| --- | --- | --- |
| `JELLYFIN_URL` / `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` | none | Enable the Jellyfin source (your own server, reachable from the backend). |
| `JELLYFIN_EDGE_INJECT` | `false` | Deliver Jellyfin via the proxy edge (token injected at the edge) instead of the backend proxy. Requires the proxy's `NITRO_JELLYFIN_*`. |
| `RUN_CACHE_WORKER` | `true` | Run the background ffmpeg cache downloader on this replica. Set `true` on one dedicated worker only. |
| `CACHE_INTERNAL_BASE` / `CACHE_MAX_CONCURRENT` / `CACHE_DOWNLOAD_TIMEOUT` / `CACHE_MIN_FREE_BYTES` / `CACHE_QUEUE_MAX` | see `.env.example` | Cache downloader tuning. |
| `PRIVATE_SOURCES_ENABLED` | `1` | Set to `0` to make the backend ignore any build-time private source overlay entirely, so source discovery returns an empty list. |
| `SOURCE_HEALTH_TTL` | `300` | Seconds the admin Source-Health probe sweep is cached before it re-runs. |
| `LOCAL_HLS_PRESET` / `LOCAL_HLS_CRF` / `LOCAL_HLS_AUDIO_BITRATE` / `LOCAL_HLS_SEGMENT_SECONDS` / `LOCAL_HLS_SEGMENT_TIMEOUT` | `veryfast` / `21` / `160k` / `6` / `120` | ffmpeg settings for on-the-fly transcoding of local files that the browser can't play directly. |

See [Operator-owned sources](/reference/operator-sources/) for setup.

## The background downloader (aria2, optional)

Off unless you run an [aria2](https://aria2.github.io/) instance beside the backend.
It claims pending download jobs, hands the URL to aria2 over its JSON-RPC interface,
and publishes progress back.

| Variable | Default | Description |
| --- | --- | --- |
| `ARIA2_RPC_URL` | `http://aria2:6800/jsonrpc` | Where the aria2 JSON-RPC endpoint lives. |
| `ARIA2_RPC_SECRET` | none | The RPC token aria2 was started with. |
| `ARIA2_RPC_TIMEOUT` | `15` | Seconds to wait on an RPC call. |
| `RUN_DOWNLOAD_WORKER` | `true` | Run the aria2 poll loop on this replica. Exactly like `RUN_CACHE_WORKER`, set `true` on **one** dedicated worker in a multi-replica deploy. |
| `DOWNLOAD_MAX_ACTIVE` | `3` | Concurrent downloads. |
| `DOWNLOAD_POLL_INTERVAL` | `5` | Seconds between aria2 status polls. |
| `DOWNLOAD_MIN_FREE_BYTES` | `2147483648` (2 GiB) | Refuse to start a download unless the chosen root has at least this much free. |

The queue is managed from **Admin › Downloads**.

## Manga (reading surface)

The reading surface is on by default and needs **no API key**: discovery is AniList,
and chapters/pages resolve in the viewer's browser. These are plain preferences (they
name no host); the last two are read only by an optional server-side provider.

| Variable | Default | Description |
| --- | --- | --- |
| `MANGA_ENABLED` | `true` | Master switch for the whole reading surface. `false` ⇒ the manga routes `503` and the client hides the row / search / reader. |
| `MANGA_LANGUAGES` | `en` | Preferred chapter language(s), comma-separated; first is the default. Handed to the browser so its resolution matches. |
| `MANGA_CONTENT_RATING` | `safe,suggestive,erotica` | Content ratings to include, comma-separated. Add `pornographic` to include it (off by default). |
| `MANGADEX_APP_NAME` | `CrimsonHaven/1.0` | **Provider-only.** Descriptive `User-Agent` for the optional server-side provider. |
| `MANGA_PROXY_SECRET` | falls back to `PROXY_SECRET` | **Provider-only.** Signs `/manga_proxy` image links. A base build ignores it entirely. |

See [The reading surface (manga)](/self-hosting/manga/) for the full picture.

## Local media library

There is **nothing to switch on**: the browsable local library follows the Local
source (enable one in the admin dashboard). The only related variable is optional:

| Variable | Default | Description |
| --- | --- | --- |
| `LOCAL_PROXY_SECRET` | read only when `PROXY_SECRET` is unset | Signs the public `/local_art` poster image links. Set `PROXY_SECRET` instead; this cannot override it. |

See [The local media library](/self-hosting/local-library/) for the full picture, and
[Operator-owned sources](/reference/operator-sources/#local-your-own-files) for the
Local source itself.

## Live TV (IPTV)

The Live TV surface is on by default and needs **no API key**. The catalogue is
the [iptv-org](https://github.com/iptv-org/iptv) public index, fetched twice
daily into memory (no database table). Playback is direct-first; the signed
`/iptv_proxy` carries only what the browser's own rules won't allow.

| Variable | Default | Description |
| --- | --- | --- |
| `IPTV_ENABLED` | `true` | Master switch for the whole Live TV surface. `false` ⇒ the IPTV routes `503` and the client hides the nav entry and routes. |
| `IPTV_REFRESH_HOURS` | `12` | Hours between catalogue refreshes (upstream publishes daily). |
| `IPTV_INCLUDE_NSFW` | `false` | Include NSFW-flagged channels in the catalogue. |
| `IPTV_PROXY_SECRET` | read only when `PROXY_SECRET` is unset | Signs `/iptv_proxy` stream links. Set `PROXY_SECRET` instead; this cannot override it. |

See [The Live TV surface (IPTV)](/self-hosting/live-tv/) for the full picture.

## Lumi, the chatbot

Optional, asleep by default. **Only the provider keys are environment
variables**; the master switch, provider, model, budgets and the per-account
grants are operator state in PostgreSQL, managed from **Admin › Lumi** and
**Admin › Users**, so none of it needs a redeploy. Keys stay out of the database
on purpose, so a dump of your accounts never carries billable credentials.

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Claude. The recommended provider (best at persona fidelity and tool accuracy). |
| `GEMINI_API_KEY` | unset | Google AI Studio. `GOOGLE_API_KEY` is accepted as an alias. |

Setting a key does **not** switch the feature on, and switching it on does not
give anyone access: both are separate, audited decisions in the dashboard.

See [Lumi, the chatbot](/self-hosting/lumi/) for the full picture.

## Scaling & scheduling

| Variable | Default | Description |
| --- | --- | --- |
| `RUN_DB_SYNC` | `true` | Run the periodic Fribb mapping resync. **Exactly one replica** should have this `true`. |
| `ALLOWED_ORIGINS` | built-in list | Comma-separated CORS origins. Lock down in production. |
| `RATE_LIMIT_STORAGE_URI` | `memory://` | Rate-limit backend; `redis://…` to share limits across replicas. |
| `FORWARDED_ALLOW_IPS` | none | Trusted proxy IPs uvicorn honours `X-Forwarded-*` from. Usually `*` behind a reverse proxy. |
| `METADATA_REFRESH_*` / `RUN_METADATA_BACKFILL` / `METADATA_BACKFILL_PAGES` | see `.env.example` | Non-anime metadata maintenance (pinned to the sync replica). |
| `MIGRATIONS_DIR` | the repo's `migrations/` | Override where startup migrations are read from. Rarely needed. |

## Logging & observability

| Variable | Default | Description |
| --- | --- | --- |
| `LOG_FORMAT` | `plain` | `json` emits one JSON object per line, which is what you want behind a log shipper. |
| `METRICS_TOKEN` | none | Shared secret a Prometheus scrape presents to reach `/metrics`. The route is **not** public: with no token configured it denies everyone but an admin. |
| `PROMETHEUS_URL` | none | Base URL of a private Prometheus (e.g. `http://prometheus:9090`). Setting it turns on the history charts under **Admin › Metrics**; unset, that tab reports that no history is being collected. |
| `PROMETHEUS_JOB` | `crimson-api` | The `job` label your scrape config uses for the backend. |
| `PROMETHEUS_TIMEOUT` | `12` | Seconds to wait on a Prometheus query. |

## Demo mode

Powers a public shop-window instance, and **wipes data on a schedule**, so never set
it on anything real.

| Variable | Default | Description |
| --- | --- | --- |
| `DEMO_MODE` | `false` | Bypasses the signup invite gate and deletes **every non-admin account** (and its data) nightly. |
| `DEMO_RESET_HOUR` | `4` | Hour (server time) the nightly wipe runs. It runs on the `RUN_DB_SYNC` replica only. |

## Optional integrations (each self-disables when unset)

| Variable(s) | Feature |
| --- | --- |
| `DISCORD_BOT_TOKEN` / `DISCORD_OWNER_ID` / `DISCORD_COMMAND_PREFIX` | The [Discord invite bot](/reference/accounts/#the-discord-invite-bot) (`python -m discord_bot`). |
| `KOFI_VERIFICATION_TOKEN` / `KOFI_ACTIVE_WINDOW_DAYS` / `KOFI_LIST_CACHE_TTL` | Ko-fi supporters list (`/supporters`). |
| `GITHUB_TOKEN` / `GITHUB_REPO` / `CHANGELOG_*` | Public changelog from GitHub Releases (`/changelog`). |
| `OPENSUBTITLES_API_KEY` / `OPENSUBTITLES_APP_NAME` / `SUBTITLES_SEARCH_TTL` / `SUBTITLES_PROXY_SECRET` | OpenSubtitles player tracks (`/subtitles`). The proxy secret signs `/subtitles_proxy` links, and is read only when `PROXY_SECRET` is unset. |
| `HEALTH_CANARY_*` | The admin Source-Health probe target. |
| `DEBUG` | When truthy, includes exception detail in 500 responses. **Leave unset in production.** |

:::tip[Lumi says]
Start with just `TMDB_API_KEY`, the database, `SIGNUP_INVITE_CODE` and `PROXY_SECRET`.
Add the rest as you turn features on. None of the optional blocks are needed to boot.
:::
