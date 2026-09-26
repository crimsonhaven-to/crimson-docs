---
title: The database (PostgreSQL)
description: How Crimson Haven uses PostgreSQL, the bundled option, and what a production database setup looks like.
---

All backend state (the TMDB↔AniList mapping, the API cache, and
accounts/favorites/progress) lives in **one PostgreSQL database**, reached through a
process-wide connection pool. The API keeps no local state, so every replica is
interchangeable and points at the same database.

## The easy option: the bundled database

The backend's Docker Compose file ships a `postgres:17-alpine` service with a named
volume (`crimson-pgdata`). On a single host there is nothing to do: `docker compose
up -d` brings it up and the API waits for it to be healthy.

The bundled service takes its credentials from `.env`, and Compose builds the API's
`DATABASE_URL` from the same values (host `postgres`, port `5432`). Unset, each
defaults to `crimson`:

```ini
# In .env
POSTGRES_DB=crimson
POSTGRES_USER=crimson
POSTGRES_PASSWORD=change-me-please
```

:::caution
The bundled database is fine for **dev and single-host** setups. For anything you
care about, change the password and plan backups (below).
:::

## The production option: an external database

In production, point the backend at a managed or self-operated PostgreSQL and drop
the bundled service. The API needs no writable volume of its own:

```ini
DATABASE_URL=postgresql://crimson:strongpassword@db.internal:5432/crimson
```

`DATABASE_URL` takes precedence over the discrete `POSTGRES_*` parts. Any PostgreSQL
14+ works. The user needs permission to create tables, because the schema migrates
itself on boot (see below).

## Versioned migrations

Table creation is idempotent and runs on every boot. On top of it sits a **versioned
migration runner**: numbered files in the backend's `migrations/` directory, applied
in order and recorded with their SHA-256. An applied migration that was edited
afterwards is reported loudly (and surfaced on `/health`) instead of silently
diverging between replicas.

The whole pending batch applies in **one transaction**, under the same advisory lock
the schema init holds, so simultaneous boots serialize and the losers find nothing
pending. Two consequences if you ever read the files:

- A failure rolls back the **entire** batch, on this boot and every future one. That
  is why a migration that could plausibly be refused wraps itself in an exception
  handler instead of letting the refusal propagate.
- Statements that cannot run inside a transaction, notably
  `CREATE INDEX CONCURRENTLY`, do not belong in a migration file.

### The one privilege beyond `CREATE TABLE`

`003_search_trgm.sql` wants the `pg_trgm` extension, for the trigram indexes that
make [local anime search](/architecture/browsing-and-discovery/#search-local-first-tmdb-second)
fast. `pg_trgm` is a *trusted* extension, so on PostgreSQL 13+ a role that **owns**
its database can create it without being a superuser. That is how the reference
deployment provisions the app role.

If your role cannot, nothing breaks. A refused `CREATE EXTENSION` becomes a warning
in the log, the index creation only runs if the extension exists, and the search
query is identical either way: a plain `ILIKE`, ranked by a `CASE` expression, with no
runtime extension detection and no second code path. You get the same results, more
slowly.

```text
WARNING: pg_trgm not created (insufficient privilege):
         /search/anime still works, without its index
```

That is a note, not an incident. Give the app role ownership of its database (or
create the extension yourself as a superuser) if you want the index.

### Connection pooling at scale

Each replica holds its own pool (`DB_POOL_MIN` / `DB_POOL_MAX`). PostgreSQL has a
hard ceiling on concurrent connections, so past roughly eight replicas put
**PgBouncer** in transaction mode in front of the database and point `DATABASE_URL`
at its port (6432) instead of 5432. Leave `DB_PREPARE_THRESHOLD` unset (prepared
statements off): that is required behind a transaction-mode pooler.

### High availability

For a cluster that survives a node failure, the production reference uses **Patroni**
(PostgreSQL with automatic failover via etcd). That is beyond a starter setup; the
operational notes (such as the loopback `pg_hba` gotcha after a switchover) live in
the backend's `deploy/` folder. Most self-hosters are fine with a single, well
backed-up database.

## Backups (please do this)

Accounts and watch progress can't be re-derived. Back the database up:

- **Simplest:** a nightly `pg_dump` to off-box storage:
  ```bash
  pg_dump "$DATABASE_URL" | gzip > crimson-$(date +%F).sql.gz
  ```
- **Production:** the reference deployment uses **pgBackRest** to a single shared,
  encrypted object-storage repository (e.g. Backblaze B2 over the S3 API), with the
  stanza created once cluster-wide and the backup cron following the current leader.

## Restoring / migrating

Because the schema migrates itself, restoring means loading a dump into an empty
database and pointing `DATABASE_URL` at it. To move from the bundled database to an
external one, `pg_dump` the old one, restore into the new one, update `DATABASE_URL`
and recreate the container.

:::tip[Lumi says]
A resync of the TMDB↔AniList mapping rebuilds only the mapping tables, inside a
transaction, and never touches your users' data. That is why mapping and accounts can
safely share one database.
:::
