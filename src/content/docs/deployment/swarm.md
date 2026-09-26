---
title: Production cluster (Docker Swarm)
description: Run Crimson Haven as a high-availability, self-healing, zero-downtime Docker Swarm stack.
---

When one host isn't enough, for uptime or for load, Crimson Haven runs as a Docker
Swarm stack. The backend is stateless, so you scale it freely; only the database needs
care.

:::note[Is this for me?]
Most communities are fine on a [single host](/deployment/single-host/). Reach for
Swarm when you want **high availability** (survive a node dying) or **horizontal
scale**. It has more moving parts.
:::

## What Swarm gives you

- **Ingress routing mesh**: built-in L4 load balancing across replicas.
- **Self-healing**: failed containers are rescheduled automatically.
- **Zero-downtime rolling updates** with automatic rollback on failure.

The client and backend both ship Swarm stack files (`docker-stack.yml`) with `deploy:`
blocks: replicas, restart policy, resource limits, `start-first` updates for the
serving replicas and `stop-first` for singleton workers.

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

# The backend (the stack refuses to deploy without these three):
CRIMSON_API_IMAGE=registry.example.com/crimson-backend:1.0 \
TMDB_API_KEY=... PROXY_SECRET=$(openssl rand -hex 32) \
DATABASE_URL=postgresql://crimson:PASS@db.internal:5432/crimson \
  docker stack deploy -c docker-stack.yml crimson
docker service ls          # watch replicas converge
```

The stack file does not read `.env`: every setting a service uses is listed in its
`environment:` block and substituted from the shell at deploy time.

## The rules for multiple backend replicas

1. **`RUN_DB_SYNC=true` on exactly one replica.** The periodic TMDB↔AniList mapping
   rebuild must run once, not N times. The same flag pins the nightly metadata jobs
   and the [airing](/self-hosting/airing-calendar/) schedule refresh and notification
   jobs, so that replica is the one that opens an SMTP connection. The reference stack
   runs it in a dedicated `api-sync` service and sets `false` everywhere else.
2. **The same `PROXY_SECRET` on every replica**, so a signed link minted by one
   replica verifies on any other.
3. **Each background worker on one service only.** The reference stack gives each loop
   its own single-replica service with its flag set to `true` there and `false`
   everywhere else:

| Service | Flag |
| --- | --- |
| `cache-worker` (ffmpeg cache loop) | `RUN_CACHE_WORKER` |
| `download-worker` (aria2 poll loop) | `RUN_DOWNLOAD_WORKER` |
| `music-worker` (music downloads and playlist sync) | `RUN_MUSIC_WORKER` |

## The database in production

The serving replicas are stateless; PostgreSQL holds all state. The production
reference uses:

- **Patroni**: PostgreSQL with automatic leader election and failover via etcd. Watch
  the loopback `pg_hba` rule after a switchover (a documented gotcha in the backend's
  `deploy/` notes).
- **PgBouncer**: co-located transaction-mode pooling, so the API tier can scale past
  about 8 replicas without exhausting database connections. Point `DATABASE_URL` at
  PgBouncer's `:6432` and leave `DB_PREPARE_THRESHOLD` unset.
- **pgBackRest**: encrypted backups to a single shared object-storage repository
  (e.g. Backblaze B2 via S3). Create the stanza once cluster-wide; the backup cron
  follows the current leader.

The operational details live in the backend's `deploy/` directory. If that is more
than you need, a single well backed-up PostgreSQL behind the stack is fine.

## Scale the edge, not the core

Video bytes don't flow through your stack, so scaling is mostly about the
**database** and the stateless API tier, not bandwidth. The heavy lifting happens on
the free [edge proxy](/self-hosting/proxy/) (deploy to both Netlify and Cloudflare for
redundancy) and in visitors' browsers via the [extension](/self-hosting/extension/).

## Dev vs prod environments

The reference setup runs a parallel **dev** environment off `main`: a single-replica
stack with its own isolated PostgreSQL, on separate hostnames
(`dev-backend.example.com`, `dev.example.com`), so every push is exercised there
before a tag ships it to production. [The CI/CD pipeline](/deployment/cicd/) wires
this up.
