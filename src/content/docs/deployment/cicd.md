---
title: The CI/CD pipeline
description: How Crimson Haven builds and deploys automatically, covering registry images, the single-branch model, and the cross-repo private-sources wiring.
---

Each repository ships a `.gitlab-ci.yml` so pushes build and deploy themselves. This
page explains the model so you can reproduce it for your own group.

## The branch model

Every repo lives on a **single** `main` branch. The environment is chosen by *how* you
push, not by which branch you push to:

| Trigger | Environment | Deploys to |
| --- | --- | --- |
| **push to `main`** | Staging | the dev stack |
| **a `v*` tag** | Production | the production stack |

You work on `main` and watch it land on `dev.example.com`, then cut a `v1.2.3` tag
when it is ready for `example.com`. Other branches and merge requests never build or
deploy; merge requests only run the dependency scan.

## The backend pipeline

On a push to `main` or a `v*` tag, the backend pipeline:

1. **Lints** with `ruff` (correctness rules), blocking.
2. **Type-checks** with `mypy`. A type error fails the job.
3. **Runs `pytest`**, blocking. The suite includes a contract test that imports the
   app and generates the OpenAPI schema, so "it builds in CI" means "it boots."
4. **Builds and pushes** a private image to the GitLab Container Registry, baking in
   any overlays (below).
5. **Deploys** to the swarm: a `main` push rolls an immutable `:dev-<sha>` tag onto the
   dev stack; a `v*` tag deploys to production and builds and rolls the sourceless
   demo stack.

### Optional overlays

With either CI/CD variable set to a `group/project` path on the same GitLab, the
build clones that project and bakes it into the image:

| Variable | Bakes in | Details |
| --- | --- | --- |
| `SOURCES_REPO` | `resolvers/`, `scrapers/` and `manga/` | [Adding your own sources](/self-hosting/sources/) |
| `MUSIC_REPO` | `music/`, its Python packages and Deno | [The music library](/self-hosting/music/) |

Unset, the build is the plain public image. The clone authenticates with
`CI_JOB_TOKEN`, so each overlay project must add crimson-backend under
*Settings → CI/CD → Job token permissions*. The demo image never gets overlays.

:::caution[Protect the `v*` tags]
Mark `SOURCES_REPO` and `MUSIC_REPO` as **protected** variables, and protect the
`v*` tag pattern under *Settings → Repository → Protected tags*. GitLab only exposes
protected variables to pipelines on protected branches and tags, so an unprotected
release tag builds a plain image without your overlays. The same applies to the
client's `CRIMSON_SOURCES_REPO` if you mark it protected.
:::

## The client pipeline and the cross-repo sources wiring

This part needs care, because the client bundles your **private** sources engine. The
pipeline:

1. **Runs the gate**: ESLint and the Vitest unit suite.
2. **Clones the sources repo at build time** into `vendor/crimson-sources`, using the
   pipeline's own `CI_JOB_TOKEN`. It always takes `main`, so a build bundles the current
   engine without a manual submodule bump.
3. **Falls back cleanly.** If the sources repo is unset, unreachable, or you lack
   access, the clone is skipped and Vite swaps in the built-in stub
   (`src/sourcesStub.js`). The build still succeeds and the client plays via the
   backend only, which keeps the repo forkable by people who cannot see your engine.
4. **Builds** the static bundle with `VITE_API_BASE_URL` **and** `VITE_SITE_URL` baked
   in per environment (a `main` push uses the dev backend and the `dev.` origin; a
   `v*` tag uses prod). `VITE_SITE_URL` points the social-embed (`og:image`) URLs at the
   right host. The result is shipped as an Nginx image.
5. **Deploys** to the matching stack. A `v*` tag also publishes a sourceless demo to
   GitLab Pages.

The build also bakes two **optional** display strings from CI/CD variables (not
secrets): `HOSTED_IN` and `DMCA_MAIL` become `VITE_HOSTED_IN` and `VITE_DMCA_MAIL`. Set
them under *Settings → CI/CD → Variables* to brand a fork; leave them unset to keep
the defaults. See
[The client](/self-hosting/client/#deployment-specific-text-optional-build-args).

### The one permission you must grant

Point the client at your engine with the CI/CD variable **`CRIMSON_SOURCES_REPO`**
(for example `your-group/crimson-sources`), then add crimson-client to that project's
job token allowlist under *crimson-sources → Settings → CI/CD → Job token
permissions*. Without the allowlist entry the clone is rejected and you silently get a
stub build.

The companion extension is **not** part of this wiring. It ships on the
[Chrome Web Store](/self-hosting/extension/#distributing-it-to-your-visitors), and its
own repo publishes to the store on a `v*` tag.

:::tip[Lumi says]
Keep every repo under **one group**. The client finds its sources repo through a
single CI/CD variable, so forking the whole set means changing one value, not hunting
absolute URLs through the tree.
:::

## The sources pipeline

crimson-sources has no image of its own. Its pipeline is a typecheck-and-test gate
plus two jobs that trigger a client rebuild:

- a **push to `main`** that changes the engine triggers the client's dev build
  (docs-only pushes are skipped),
- a **`v*` tag** triggers the client's prod build.

Both client builds bundle `sources@main`, so the tag is the release *gesture*: it
promotes whatever `main` holds, and the client pins it by baking it into the
immutable image it publishes.

The triggers use the job token too, so add crimson-sources to crimson-client's job
token allowlist (*crimson-client → Settings → CI/CD → Job token permissions*), or the
trigger is rejected.

## The proxy pipeline

The [proxy](/self-hosting/proxy/) deploys to edge hosting on push to `main`:

- **Cloudflare** via `wrangler`, which uploads `NITRO_PROXY_SECRET` as a Worker secret
  on each deploy.
- **Netlify** via the Netlify CLI (`netlify deploy --prod`), since Netlify's git
  integration won't connect a private group repo.

Each job skips itself when its token is absent, so you can run one, the other, or both.

## Order of operations when you push everything

Because the client clones its sources at build time, push the **sources repo before
the client that bundles it**:

1. Push your **sources** repo.
2. Push the **backend**.
3. Push the **client** (which bundles 1 and talks to 2).

As long as 1 is on its remote before the client build runs, everything lines up. The
companion extension publishes from its own repo, independently of this order.

## Reproducing it for your group

1. Fork or clone all repos into **one** GitLab group.
2. Set `CRIMSON_SOURCES_REPO` on the client and add the client to the sources repo's
   job token allowlist. Optionally set `SOURCES_REPO` / `MUSIC_REPO` on the backend.
3. Protect the `v*` tag pattern in crimson-backend and crimson-client if any of those
   variables are protected.
4. Add the deploy secrets you use. The container registry is automatic; for the proxy,
   add the Cloudflare and/or Netlify tokens plus `NITRO_PROXY_SECRET`.
5. Point the deploy steps at your own server and registry. The reference uses a shell
   runner with passwordless SSH to the swarm manager, which runs a `deploy.sh` per
   stack.
