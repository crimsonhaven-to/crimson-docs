---
title: The CI/CD pipeline
description: How Crimson Haven builds and deploys automatically, covering GHCR images, the dev/main branch model, and the cross-repo private-sources wiring.
---

Each repository ships a GitHub Actions workflow so pushes build and deploy themselves.
This page explains the model so you can reproduce it for your own org.

## The branch model

| Branch | Environment | Trigger | Deploys to |
| --- | --- | --- | --- |
| `dev` | Staging | **push** (code changes; markdown-only pushes skipped) | the dev stack |
| `main` | Production | **tagged release** | the production stack |

So you test on `dev` (`dev.example.com`), and cut a release on `main` when it's ready.

## The backend pipeline (`build-image.yml`)

On push, the backend workflow:

1. **Lints** with `ruff` (pyflakes correctness rules). Blocking.
2. **Type-checks** with `mypy`. Informational, non-blocking.
3. **Runs `pytest`**. Blocking. The suite includes a contract test that imports the
   app and generates the OpenAPI schema, so "it builds in CI" really means "it boots."
4. **Builds + pushes** a private image to GitHub Container Registry (GHCR).
5. **Deploys** to the swarm: a `dev` push rolls an immutable `:dev-<sha>` tag onto the
   dev stack; a release deploys to production.

The backend has **no dependency on your sources repo**, so its pipeline is entirely
self-contained.

## The client pipeline, and the cross-repo sources dance

This is the one part that needs care, because the client bundles a **private** sources
engine. Locally that's a git submodule (`vendor/crimson-sources`, with a relative URL
so it resolves to a sibling of whatever org hosts the client). **In CI it is not a
submodule checkout at all**, because a submodule pin would freeze the engine at
whatever commit was last committed. The workflow:

1. Checks the client out **without** submodules, then fetches the sources engine in a
   separate, best-effort step driven by two repo secrets:
   ```yaml
   env:
     SOURCES_REPO: ${{ secrets.CRIMSON_SOURCES_REPO }}   # e.g. yourorg/crimson-sources
     GIT_TOKEN:    ${{ secrets.SUBMODULES_TOKEN || github.token }}
   ```
   It shallow-clones `<SOURCES_REPO>@<branch>` into `vendor/crimson-sources`. Which
   repo that is, is **never hardcoded** in the workflow.
2. Picks the **freshest branch tip per channel**: `sources@dev` on a dev push,
   `sources@main` on a release, so a build always bundles the latest engine without a
   manual submodule bump.
3. **Never fails on a missing engine.** If `CRIMSON_SOURCES_REPO` is unset, the token
   can't read it, or the branch is missing, the step logs a warning and leaves the
   directory empty. `vite.config.js` then swaps in the no-op stub and the build
   succeeds with no client-side sources. That is what lets someone without access to
   your private repo deploy the client at all.
4. **Builds** the static bundle with `VITE_API_BASE_URL` **and** `VITE_SITE_URL` baked
   in per environment (the dev push uses the dev backend and the `dev.` origin; a
   release uses prod). The latter fixes social-embed (`og:image`) URLs to the right
   host. Then it ships the Nginx image.
5. **Deploys** to the matching stack.

The build also bakes two **optional** display strings from repository **Actions
variables** (not secrets): `HOSTED_IN` and `DMCA_MAIL`, which become the client's
`VITE_HOSTED_IN` / `VITE_DMCA_MAIL`. Set them under *Settings → Secrets and variables →
Actions → Variables* to brand a fork. Left unset, the client ships its placeholders
(`Secret:3` and `NoEmailProvided`), which is fine for a private instance and clearly
not what you want on a public one. See
[The client](/self-hosting/client/#deployment-specific-text-optional-build-args).

### Sources-driven rebuilds

The client workflow also accepts a `workflow_dispatch` with a `channel` input
(`dev` or `prod`), and the sources repo's own CI fires it through the API. So pushing
your sources engine rebuilds and redeploys the client on its own, with no client-repo
push and no submodule bump. `channel=dev` builds `:dev-<sha>` from `sources@dev` and
rolls the dev stack; `channel=prod` builds `:main-<sha>` from `sources@main` and rolls
production, the same target as a published release.

### The secrets you must add

| Secret | Why |
| --- | --- |
| `SUBMODULES_TOKEN` | A Personal Access Token with **read** access to your private sources repository. The default `github.token` can only read the repo it's running in. |
| `CRIMSON_SOURCES_REPO` | The `owner/repo` slug of that sources repository. Unset means "build without sources", which is a valid setup, not an error. |

The companion extension is **not** part of this dance any more. It ships on the
[Chrome Web Store](/self-hosting/extension/#distributing-it-to-your-visitors), and its
own repo has a separate workflow that publishes to the store on a tagged release.

:::tip[Lumi says]
Keep every repo under **one organisation/owner**. The client's submodule URL is
relative (`../crimson-sources`), so a local `git submodule update` resolves to a
sibling of whatever org hosts the client, with no absolute URLs to update when you
fork the whole set.
:::

## The demo pipeline (optional)

A published release also builds a deliberately **sourceless** demo, in two halves:

- The backend builds a separate, clean `:demo` / `:demo-<tag>` image with **no**
  private source overlay baked in, and rolls it onto its own `crimson-demo` stack
  running in demo mode.
- The client publishes a matching sourceless bundle to **GitHub Pages**
  (`pages-demo.yml`), on GitHub-hosted runners, with no swarm involved. It builds
  with the stub, points `VITE_API_BASE_URL` at the demo backend, and carries its own
  `CNAME`.

Neither half can play a stream, by design: no sources means nothing to host. The demo
shows the UI and the account flows only. Skip both jobs entirely if you don't want a
public shop window.

## The proxy pipeline

The [proxy](/self-hosting/proxy/) deploys to edge hosting on push to `main`:

- **Cloudflare** via `wrangler-action` (uploads `NITRO_PROXY_SECRET` as a Worker
  secret each deploy).
- **Netlify** via the Netlify CLI (`netlify deploy --prod`), since git integration
  won't connect a private org repo.

Both self-skip when their tokens are absent, so you can run one, the other, or both.

## Order of operations when you push everything

Because the client build pulls the sources engine at its branch tip, push the
**engine before the client that bundles it**:

1. Push your **sources** repo.
2. Push the **backend**.
3. Push the **client** (which bundles 1 and talks to 2).

CI for the client resolves the freshest tip, so as long as 1 is on its remote before
the client build runs, everything lines up. In practice step 3 is often automatic,
since the sources repo dispatches the client rebuild itself. (The companion extension
publishes to the Chrome Web Store from its own repo, independently of this order.)

## Reproducing it for your org

1. Fork/clone all repos into **one** GitHub organisation.
2. Add the `SUBMODULES_TOKEN` and `CRIMSON_SOURCES_REPO` secrets.
3. Add the deploy secrets you use: GHCR is automatic; for the proxy add the
   Cloudflare/Netlify secrets + `NITRO_PROXY_SECRET`.
4. Point the deploy steps at your own server/registry (the reference uses a
   self-hosted runner on a jump host with durable `read:packages` login and a
   `deploy.sh` on the managers).
