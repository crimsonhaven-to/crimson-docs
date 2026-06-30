---
title: The database (PostgreSQL)
description: How Crimson Haven uses PostgreSQL, the easy bundled option, and what a production database setup looks like.
---

All of the backend's state — the TMDB↔AniList mapping, the API cache, and
accounts/favorites/progress — lives in **one PostgreSQL database**, reached through
a process-wide connection pool. Because the API keeps no local state, every replica
is interchangeable and points at the same database.

## The easy option: the bundled database

The backend's Docker Compose file ships a `postgres:17-alpine` service with a named
volume (`crimson-pgdata`). For a single host you don't need to do anything — `docker
compose up -d` brings it up and the API waits for it to be healthy.

```ini
# In .env — the discrete parts the bundled service uses:
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=crimson
POSTGRES_USER=crimson
POSTGRES_PASSWORD=change-me-please
```

:::caution
The bundled database is great for **dev / single-host**. For anything you care about,
change the password and plan backups (below).
:::

## The production option: an external database

In production, point the backend at a managed or self-operated PostgreSQL and drop
the bundled service — the API needs no writable volume of its own:

```ini
DATABASE_URL=postgresql://crimson:strongpassword@db.internal:5432/crimson
```

`DATABASE_URL` takes precedence over the discrete `POSTGRES_*` parts. Any PostgreSQL
14+ works. The user needs permission to create tables (the schema self-migrates on
boot).

### Connection pooling at scale

Each replica holds its own pool (`DB_POOL_MIN` / `DB_POOL_MAX`). PostgreSQL has a
hard ceiling on concurrent connections, so past roughly eight replicas you'll want
**PgBouncer** in transaction mode in front of the database, with the backend pointing
`DATABASE_URL` at PgBouncer's port (6432) instead of 5432. When you do, leave
`DB_PREPARE_THRESHOLD` unset (prepared statements off) — that's required behind a
transaction-mode pooler.

### High availability

For a cluster that survives a node failure, the production reference uses **Patroni**
(PostgreSQL with automatic failover via etcd). That's beyond a starter setup; the key
operational notes (the loopback `pg_hba` gotcha after a switchover, etc.) live with
the backend's `deploy/` folder. Most self-hosters are fine with a single well-backed-up
database.

## Backups (please do this)

State is precious — accounts and watch progress can't be re-derived. Back the
database up:

- **Simplest:** a nightly `pg_dump` to off-box storage:
  ```bash
  pg_dump "$DATABASE_URL" | gzip > crimson-$(date +%F).sql.gz
  ```
- **Production:** the reference deployment uses **pgBackRest** to a single shared,
  encrypted object-storage repository (e.g. Backblaze B2 over the S3 API), with the
  stanza created once cluster-wide and the backup cron following the current leader.

## Restoring / migrating

Because the schema self-migrates, restoring is just loading a dump into an empty
database and pointing `DATABASE_URL` at it. To move from the bundled database to an
external one, `pg_dump` the old and restore into the new, then update `DATABASE_URL`
and recreate the container.

:::tip[Lumi says]
A resync of the TMDB↔AniList mapping rebuilds only the mapping tables, inside a
transaction — it never touches your users' data. That's why mapping and accounts can
safely share one database.
:::
