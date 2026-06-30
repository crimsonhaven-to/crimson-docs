---
title: Production cluster (Docker Swarm)
description: Run Crimson Haven as a high-availability, self-healing, zero-downtime Docker Swarm stack.
---

When one host isn't enough — for uptime or for load — Crimson Haven runs as a Docker
Swarm stack. Because the backend is stateless, you scale it freely; only the database
needs care.

:::note[Is this for me?]
Most communities are fine on a [single host](/deployment/single-host/). Reach for
Swarm when you want **high availability** (survive a node dying) or **horizontal
scale**. It's more moving parts.
:::

## What Swarm gives you

- **Ingress routing mesh** — built-in L4 load balancing across replicas.
- **Self-healing** — failed containers are rescheduled automatically.
- **Zero-downtime rolling updates** with automatic rollback on failure.

The client and backend both ship Swarm-ready stack files (`docker-stack.yml`) with
`deploy:` blocks (replicas, restart policy, resource limits, `stop-first` updates).

## Deploying the stacks

```bash
# On a manager node, once:
docker swarm init

# The client (built + pushed to a registry your nodes can reach):
docker build --build-arg VITE_API_BASE_URL=https://backend.example.com \
  -t registry.example.com/crimson-client:1.0 .
docker push registry.example.com/crimson-client:1.0
CRIMSON_IMAGE=registry.example.com/crimson-client:1.0 \
  docker stack deploy -c docker-stack.yml crimson-client

# The backend:
docker stack deploy -c docker-stack.yml crimson
docker service ls          # watch replicas converge
```

## The two rules for multiple backend replicas

1. **`RUN_DB_SYNC=true` on exactly one replica.** The periodic TMDB↔AniList mapping
   rebuild must run once, not N times. The reference stack pins it to a dedicated
   `api-sync` service and sets `false` everywhere else.
2. **The same `PROXY_SECRET` on every replica**, so a signed link minted by one
   replica verifies on any other.

A third, if you use the cache worker: run the background ffmpeg downloader on **one**
dedicated worker service (`RUN_CACHE_WORKER=true` there, `false` elsewhere).

## The database in production

The serving replicas are stateless; PostgreSQL is the stateful heart. The production
reference uses:

- **Patroni** — PostgreSQL with automatic leader election + failover via etcd. (Watch
  the loopback `pg_hba` rule after a switchover — a documented gotcha in the backend's
  `deploy/` notes.)
- **PgBouncer** — co-located transaction-mode pooling so the API tier can scale past
  ~8 replicas without exhausting database connections. Point `DATABASE_URL` at
  PgBouncer's `:6432` and leave `DB_PREPARE_THRESHOLD` unset.
- **pgBackRest** — encrypted backups to a single shared object-storage repository
  (e.g. Backblaze B2 via S3). Create the stanza once cluster-wide; the backup cron
  follows the current leader.

These are involved; the operational specifics live alongside the backend's `deploy/`
directory. If that's more than you need, a single well-backed-up PostgreSQL behind the
stack is perfectly legitimate.

## Scaling the edge, not the core

Remember the design: video bytes don't flow through your stack. So scaling is mostly
about the **database** and the stateless API tier — not bandwidth. The heavy lifting
is on the free [edge proxy](/self-hosting/proxy/) (deploy to both Netlify and
Cloudflare for redundancy) and in visitors' browsers via the
[extension](/self-hosting/extension/).

## Dev vs prod environments

The reference setup runs a parallel **dev** environment from the `dev` branches: a
single-replica stack with a bundled (isolated) PostgreSQL, on separate hostnames
(`dev-backend.example.com`, `dev.example.com`), so changes are tested before a release
ships to production. The [CI/CD pipeline](/deployment/cicd/) page wires this up.
