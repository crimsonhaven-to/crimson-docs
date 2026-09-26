---
title: The backend (the brain)
description: Set up, configure and run crimson-backend, the metadata, accounts and orchestration engine of Crimson Haven.
---

The backend is the one piece you can't skip. It serves metadata, runs accounts and
the login wall, and orchestrates playback through small grant endpoints. It keeps no
local state (everything lives in PostgreSQL), so it scales horizontally.

## What it needs

- **Python 3.14** (what the Docker image and the type checks use), or just Docker.
- **A PostgreSQL database**, reachable, with a user that can create tables. The
  bundled Compose file ships one; production should use a managed or external
  instance. See [The database](/self-hosting/database/).
- **A TMDB API key**, the only mandatory third-party secret.

## Running it

### With Docker (recommended)

```bash
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-backend.git
cd crimson-backend
cp .env.example .env       # then edit it (see below)
docker compose up -d       # brings up PostgreSQL + the API
curl http://localhost:8000/health
```

The API runs as a non-root user with a `HEALTHCHECK` on `/health`, and waits for
PostgreSQL to be healthy before starting. The schema is created on first boot and
kept current by a [versioned migration runner](/self-hosting/database/#versioned-migrations),
so an empty database is all you need.

### Without Docker (for development)

```bash
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # edit it
uvicorn api:app --host 0.0.0.0 --port 8000
```

Run the tests with `pip install -r requirements-dev.txt && pytest -q`.

## Minimum configuration

Edit `.env`. The minimum to boot:

```ini
TMDB_API_KEY=your_tmdb_read_access_token
DATABASE_URL=postgresql://crimson:crimson@localhost:5432/crimson
# Let yourself sign up; without a code, registration is closed:
SIGNUP_INVITE_CODE=some-code
# A stable secret for signing (generate: openssl rand -hex 32):
PROXY_SECRET=...
```

The Compose file refuses to start without `TMDB_API_KEY` and `PROXY_SECRET`, and
builds `DATABASE_URL` for the bundled database itself.

[Backend environment](/reference/backend-env/) documents **every** variable. The main
groups:

| Group | Variables |
| --- | --- |
| Database | `DATABASE_URL` (or the discrete `POSTGRES_*` parts), pool sizing |
| Login wall and accounts | `REQUIRE_LOGIN`, `SIGNUP_INVITE_CODE`, `ADMIN_EMAILS`, optional `SMTP_*` for email accounts |
| Proxy signing | `PROXY_SECRET`, `CRIMSON_PROXY_BASE` for the `/sign` grant |
| Operator-owned sources | `JELLYFIN_*` and the cache worker |

:::caution[Compose and Swarm read .env differently]
The Compose file loads the whole `.env` into the API container (`env_file`). The Swarm
stack file does not: it injects only the variables **listed** in each service's
`environment:` block and uses the shell environment for `${...}` substitution. Either
way, recreate the container after changing values (`docker compose up -d`).
:::

## What the backend exposes

Full reference in the [API docs at `/docs`](http://localhost:8000/docs) on a running
instance.

| Group | Examples | Purpose |
| --- | --- | --- |
| **Content** | `/search`, `/trending`, `/info`, `/seasons`, `/catalogue` | Metadata and browsing. |
| **Watch** | `/watch/{tmdb}/{s}/{e}`, `/watch/movie/{tmdb}` | The progressive NDJSON stream of resolved sources. |
| **Grants** | `/scrape-meta`, `/sign`, `/resolve` | Hand the client what it can't derive itself. |
| **Operator proxies** | `/jellyfin_proxy`, `/local_proxy`, `/cache_proxy`, `/player` | Serve **your own** media. |
| **Accounts** | `/auth/*`, `/account/*` | Sign-in, favorites, watch progress. |
| **Account security** | `/account/sessions`, `/account/security-events`, `/account/export`, `DELETE /account` | A member's [own view of their sessions and ledger](/reference/accounts/#your-account-in-your-own-hands), their data export, and self-service deletion. |
| **Airing** | `/calendar`, `/account/subscriptions` | The [weekly broadcast schedule and follows](/self-hosting/airing-calendar/). Always on; the email is opt-in. |
| **Wrapped** | `/account/wrapped` | A member's [year in review](/reference/accounts/#crimson-wrapped). |
| **Extras** | `/recommendations`, `/supporters`, `/changelog`, `/subtitles`, `/skiptimes` | Optional features. |
| **Chat** | `/chat`, `/chat/status`, `/chat/conversations` | [Lumi's chatbot](/self-hosting/lumi/). Optional, asleep by default, granted per account. |

### The progressive `/watch` stream

`/watch` streams **NDJSON** (one JSON object per line) instead of one JSON body, so
each resolved source reaches the player as soon as it is ready:

```jsonc
{"type":"meta","tmdb_id":1234,"season_number":1,"episode_number":1,"title":"…"}
{"type":"stream","source":"Jellyfin","streamType":"hls","url":"https://…/jellyfin_proxy/…"}
{"type":"done","count":1}
```

The client's in-browser engine emits the **same line shape** for the sources it
resolves, and the two are merged into one list. This is what lets scraping move to
the browser without changing the player.

## Operator-owned sources

The backend can serve three kinds of media you control (not third-party scraping):

| Kind | What it is | Served via |
| --- | --- | --- |
| **Local** | Browser-playable files in directories or NAS mounts you register in the admin dashboard. Supports seeking. | `/local_proxy` |
| **Cache** | Episodes the optional cache worker already remuxed onto your NAS. | `/cache_proxy` |
| **Jellyfin** | Your own Jellyfin server, configured by `JELLYFIN_*`. The access token is injected server-side and never reaches the browser. | `/jellyfin_proxy` |

See [Operator-owned sources](/reference/operator-sources/) to enable each.

## Scaling notes

The backend is stateless, so you can run many replicas behind a load balancer. Two
rules:

1. Set `RUN_DB_SYNC=true` on **exactly one** replica. That flag pins the periodic
   mapping rebuild, the nightly metadata jobs *and* the
   [airing](/self-hosting/airing-calendar/) refresh and notification jobs.
2. Set the **same `PROXY_SECRET`** on every replica so signed links verify anywhere.

The [Swarm deployment](/deployment/swarm/) page covers high-availability PostgreSQL,
connection pooling and backups.

### Concurrent cache misses are coalesced

The response cache is two-tier (a per-process L1 in front of the database). Without
coalescing, every concurrent request for a cold or just-expired key would miss both
tiers and hit the upstream at once. AniList is the painful case: it rate limits hard,
and `nextAiringEpisode` makes a popular title's entry expire while that title is at
peak traffic, so one stampede became a multi-second stall for everyone in it.

The three widest-fan-in fetchers (AniList metadata, TMDB search, TMDB trending) run
their miss path through a keyed single-flight: the first caller fetches, everyone else
waits on the same result. A failure is never cached, and a client disconnecting
mid-request does not abort the fetch the other waiters rely on.

The map is **per process**, so with three replicas a stampede collapses to three
upstream calls rather than one. That is the same per-replica caveat the rate limiter
has, and still a large reduction. Nothing to configure.

### Where startup lives

The lifespan body (schema init, the migration runner, admin bootstrap, every
scheduled job, the warm-ups and the shutdown drain) lives in `startup.py`, next to
`api.py`. Its module docstring is a table of which replica runs which job, and the
jobs are registered in three functions named after the pinning rule:
`_every_replica`, `_sync_replica` and `_cached_services`.
