---
title: The CI/CD pipeline
description: How Crimson Haven builds and deploys automatically, covering registry images, the single-branch model, and the cross-repo private-sources wiring.
---

Each repository ships a `.gitlab-ci.yml` so pushes build and deploy themselves.
This page explains the model so you can reproduce it for your own group.

## The branch model

Every repo lives on a **single** `main` branch. The environment is chosen by *how* you
push, not by which branch you push to:

| Trigger | Environment | Deploys to |
| --- | --- | --- |
| **push to `main`** (code changes; docs-only pushes skipped) | Staging | the dev stack |
| **a `v*` tag** | Production | the production stack |

So you work on `main` and watch it land on `dev.example.com`, then cut a `v1.2.3` tag
when it is ready for `example.com`. Short-lived feature branches and merge requests
still run the quality gate, they just never deploy.

## The backend pipeline

On push, the backend pipeline:

1. **Lints** with `ruff` (pyflakes correctness rules), blocking.
2. **Type-checks** with `mypy`, informational and non-blocking.
3. **Runs `pytest`**, blocking. The suite includes a contract test that imports the
   app and generates the OpenAPI schema, so "it builds in CI" really means "it boots."
4. **Builds + pushes** a private image to the GitLab Container Registry.
5. **Deploys** to the swarm: a `main` push rolls an immutable `:dev-<sha>` tag onto the
   dev stack; a `v*` tag deploys to production and refreshes the sourceless demo stack.

The backend has **no dependency on your sources repo**, so its pipeline is entirely
self-contained.

## The client pipeline and the cross-repo sources dance

This is the one part that needs care, because the client bundles your **private**
sources engine. The pipeline:

1. **Clones the sources repo at build time** into `vendor/crimson-sources`, using the
   pipeline's own `CI_JOB_TOKEN`. There is no committed submodule pointer, so a build
   always bundles the current engine without a manual bump.
2. **Falls back cleanly.** If the sources repo is unset, unreachable, or you simply do
   not have access, the clone is skipped and Vite swaps in the built-in stub
   (`src/sourcesStub.js`). The build still succeeds and the client plays via the
   backend only, which is what makes the repo forkable by people who cannot see your
   private engine.
3. **Builds** the static bundle with `VITE_API_BASE_URL` **and** `VITE_SITE_URL` baked
   in per environment (a `main` push uses the dev backend and the `dev.` origin; a
   `v*` tag uses prod). The latter fixes social-embed (`og:image`) URLs to the right
   host. The result is shipped as an Nginx image.
4. **Deploys** to the matching stack.

The build also bakes two **optional** display strings from CI/CD variables (not
secrets): `HOSTED_IN` and `DMCA_MAIL`, which become the client's `VITE_HOSTED_IN` /
`VITE_DMCA_MAIL`. Set them under *Settings → CI/CD → Variables* to brand a fork; leave
them unset to keep the built-in defaults. See
[The client](/self-hosting/client/#deployment-specific-text-optional-build-args).

### The one permission you must grant

Point the client at your engine with a CI/CD variable **`CRIMSON_SOURCES_REPO`** (for
example `your-group/crimson-sources`), then add crimson-client to that project's job
token allowlist under *crimson-sources → Settings → CI/CD → Job token permissions*.
Without the allowlist entry the clone is rejected and you silently get a stub build
rather than your real engine.

The companion extension is **not** part of this dance any more. It ships on the
[Chrome Web Store](/self-hosting/extension/#distributing-it-to-your-visitors), and its
own repo has a separate pipeline that publishes to the store on a tagged release.

:::tip[Lumi says]
Keep every repo under **one group**. The client resolves its sources repo from a single
CI/CD variable, so forking the whole set means changing one value, not hunting absolute
URLs through the tree.
:::

## The sources pipeline

crimson-sources has no image of its own, so its pipeline is a typecheck-and-test gate
plus two jobs that kick a client rebuild:

- a **push to `main`** triggers the client's dev build,
- a **`v*` tag** triggers the client's prod build.

Both client builds bundle `sources@main`, so the tag is the release *gesture*: it
promotes whatever `main` currently holds, and the client pins it by baking it into the
immutable image it publishes.

## The proxy pipeline

The [proxy](/self-hosting/proxy/) deploys to edge hosting on push to `main`:

- **Cloudflare** via `wrangler` (uploads `NITRO_PROXY_SECRET` as a Worker secret each
  deploy).
- **Netlify** via the Netlify CLI (`netlify deploy --prod`), since git integration
  won't connect a private repo.

Both self-skip when their tokens are absent, so you can run one, the other, or both.

## Order of operations when you push everything

Because the client clones its sources at build time, push the **sources repo before the
client that bundles it**:

1. Push your **sources** repo.
2. Push the **backend**.
3. Push the **client** (which bundles 1 and talks to 2).

As long as 1 is on its remote before the client build runs, everything lines up. (The
companion extension publishes to the Chrome Web Store from its own repo, independently
of this order.)

## Reproducing it for your group

1. Fork/clone all repos into **one** GitLab group.
2. Set `CRIMSON_SOURCES_REPO` on the client and add it to the sources repo's job token
   allowlist.
3. Add the deploy secrets you use: the container registry is automatic; for the proxy
   add the Cloudflare/Netlify tokens plus `NITRO_PROXY_SECRET`.
4. Point the deploy steps at your own server/registry (the reference uses a shell
   runner on a jump host with passwordless SSH to the swarm managers and a `deploy.sh`
   on each manager).
