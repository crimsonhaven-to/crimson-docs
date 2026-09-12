---
title: The backend (the brain)
description: Set up, configure and run crimson-backend — the metadata, accounts and orchestration engine at the heart of Crimson Haven.
---

The backend is the one piece you can't skip. It serves metadata, runs accounts and
the login wall, and orchestrates playback through small grant endpoints. It holds no
local state of its own — everything lives in PostgreSQL — so it scales horizontally.

## What it needs

- **Python 3.10+** (the Docker image uses 3.14-slim) — or just Docker.
- **A PostgreSQL database** — reachable, with a user that can create tables. The
  bundled Compose file ships one for you; production should use a managed/external
  instance. See [The database](/self-hosting/database/).
- **A TMDB API key** — the only mandatory secret.

## Running it

### With Docker (recommended)

```bash
git clone https://gitlab.ramon.moe/crimsonhaven-to/crimson-backend.git
cd crimson-backend
cp .env.example .env       # then edit it (see below)
docker compose up -d       # brings up PostgreSQL + the API
curl http://localhost:8000/health
```

The Compose stack runs the API as a non-root user with a `HEALTHCHECK` on `/health`,
and waits for PostgreSQL to be healthy before starting. The database schema is
created automatically on first boot and kept current by a
[versioned migration runner](/self-hosting/database/#versioned-migrations), so you
only need an empty database.

### Without Docker (for development)

```bash
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                              # edit it
uvicorn api:app --host 0.0.0.0 --port 8000
```

Run the tests with `pip install -r requirements-dev.txt && pytest -q`.

## Minimum configuration

Edit `.env`. The bare minimum to boot:

```ini
TMDB_API_KEY=your_tmdb_read_access_token
DATABASE_URL=postgresql://crimson:crimson@localhost:5432/crimson
# Let yourself sign up; without a code, registration is closed:
SIGNUP_INVITE_CODE=some-code
# A stable secret for signing (generate: openssl rand -hex 32):
PROXY_SECRET=...
```

The [Backend environment](/reference/backend-env/) page documents **every** variable
in detail. The most important groups:

- **Database** — `DATABASE_URL` (or the discrete `POSTGRES_*` parts) + pool sizing.
- **Login wall & accounts** — `REQUIRE_LOGIN`, `SIGNUP_INVITE_CODE`, `ADMIN_EMAILS`,
  the optional `SMTP_*` for email accounts.
- **Proxy signing** — `PROXY_SECRET` + `CRIMSON_PROXY_BASE` for the `/sign` grant.
- **Operator-owned sources** — `JELLYFIN_*` and the cache worker.

:::caution[Containers don't auto-read .env]
Docker Compose / Swarm only inject the variables **explicitly listed** in a
service's `environment:` block; the `.env` file is used for `${...}` substitution,
not auto-injected. After changing values, recreate the container
(`docker compose up -d`).
:::

## What the backend exposes

A quick tour (full reference in the [API docs at `/docs`](http://localhost:8000/docs)
on a running instance):

| Group | Examples | Purpose |
| --- | --- | --- |
| **Content** | `/search`, `/trending`, `/info`, `/seasons`, `/catalogue` | Metadata + browsing. |
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

`/watch` doesn't return one JSON body — it streams **NDJSON** (one JSON object per
line) so each resolved source reaches the player the instant it's ready:

```jsonc
{"type":"meta","tmdb_id":1234,"season_number":1,"episode_number":1,"title":"…"}
{"type":"stream","source":"Jellyfin","streamType":"hls","url":"https://…/jellyfin_proxy/…"}
{"type":"done","count":1}
```

The client's in-browser engine emits the **same line shape** for the sources it
resolves, and the two are merged into one list. This is the seam that lets scraping
move to the browser without changing the player.

## Operator-owned sources

The backend can serve three kinds of media you control (not third-party scraping):

- **Local** — browser-playable files in directories / NAS mounts you register in the
  admin dashboard. Served via `/local_proxy` with seeking support.
- **Cache** — episodes the server already remuxed onto your NAS (the optional cache
  worker). Served via `/cache_proxy`.
- **Jellyfin** — your own Jellyfin server, configured by `JELLYFIN_*` env. The backend
  injects the access token server-side so it never reaches the browser.

See [Operator-owned sources](/reference/operator-sources/) to enable each.

## Scaling notes

The backend is stateless, so you can run many replicas behind a load balancer. The
two rules when you do:

1. Set `RUN_DB_SYNC=true` on **exactly one** replica. That flag pins the periodic
   mapping rebuild, the nightly metadata jobs *and* the
   [airing](/self-hosting/airing-calendar/) refresh and notification jobs.
2. Set the **same `PROXY_SECRET`** on every replica so signed links verify anywhere.

The [Swarm deployment](/deployment/swarm/) page covers high-availability PostgreSQL,
connection pooling and backups.

### Concurrent cache misses are coalesced

The response cache is two-tier (a per-process L1 in front of the database), and on a
cold or just-expired key every concurrent request used to miss both tiers and hit the
upstream at once. AniList is the painful case: it rate limits hard, and
`nextAiringEpisode` means a popular title's entry expires while that title is at peak
traffic, so one stampede became a multi-second stall for everyone in it.

The three widest-fan-in fetchers (AniList metadata, TMDB search, TMDB trending) now
run their miss path through a keyed single-flight: the first caller fetches, everyone
else waits on the same result. A failure is never cached, and a client disconnecting
mid-request does not abort the fetch the other waiters are relying on.

The map is **per process**, so with three replicas a stampede collapses to three
upstream calls rather than one. That is the same per-replica caveat the rate limiter
carries, and still a large reduction. Nothing to configure.

### Where startup lives

The lifespan body (schema init, the migration runner, admin bootstrap, every
scheduled job, the warm-ups and the shutdown drain) lives in `startup.py`, beside
`api.py` rather than inside it. Jobs are grouped under three headers that name the
pinning rule, so "which replica runs this" is readable in one place instead of spread
across 350 lines: `_register_every_replica_jobs`, `_register_sync_replica_jobs` and
`_register_optional_service_jobs`.
