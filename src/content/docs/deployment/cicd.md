---
title: The CI/CD pipeline
description: How Crimson Haven builds and deploys automatically — GHCR images, the dev/main branch model, and the cross-repo private-submodule wiring.
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

1. **Lints** with `ruff` (pyflakes correctness rules) — blocking.
2. **Type-checks** with `mypy` — informational, non-blocking.
3. **Runs `pytest`** — blocking. The suite includes a contract test that imports the
   app and generates the OpenAPI schema, so "it builds in CI" really means "it boots."
4. **Builds + pushes** a private image to GitHub Container Registry (GHCR).
5. **Deploys** to the swarm: a `dev` push rolls an immutable `:dev-<sha>` tag onto the
   dev stack; a release deploys to production.

The backend has **no dependency on your sources repo**, so its pipeline is entirely
self-contained.

## The client pipeline — the cross-repo submodule dance

This is the one part that needs care, because the client bundles **private**
submodules (your sources, and the extension). The workflow:

1. Checks out the repo **with submodules**, using a Personal Access Token so it can
   read a *different* private repo:
   ```yaml
   - uses: actions/checkout@v4
     with:
       submodules: recursive
       token: ${{ secrets.SUBMODULES_TOKEN || github.token }}
   ```
2. **Advances each submodule to its freshest branch tip** per channel (e.g. sources
   `@dev` on a dev push, `@main` on a release), so a build always bundles the latest
   engine without a manual submodule bump.
3. **Builds** the static bundle with `VITE_API_BASE_URL` baked in, packs the extension
   into the downloadable archive, and ships the Nginx image.
4. **Deploys** to the matching stack.

The build also bakes two **optional** display strings from repository **Actions
variables** (not secrets): `HOSTED_IN` and `DMCA_MAIL`, which become the client's
`VITE_HOSTED_IN` / `VITE_DMCA_MAIL`. Set them under *Settings → Secrets and variables →
Actions → Variables* to brand a fork; leave them unset to keep the built-in defaults.
See [The client](/self-hosting/client/#deployment-specific-text-optional-build-args).

### The one secret you must add

Create a Personal Access Token with **read** access to your private sources (and
extension) repositories, and add it as a repository or organisation **Actions secret**
named **`SUBMODULES_TOKEN`**. Without it, CI can't clone the private submodule and the
build fails. (The default `github.token` can only read the repo it's running in.)

:::tip[Lumi says]
Keep every repo under **one organisation/owner**. The client's submodule URLs are
relative (`../crimson-sources`), so they resolve to siblings of whatever org hosts the
client — no absolute URLs to update when you fork the whole set.
:::

## The proxy pipeline

The [proxy](/self-hosting/proxy/) deploys to edge hosting on push to `main`:

- **Cloudflare** via `wrangler-action` (uploads `NITRO_PROXY_SECRET` as a Worker
  secret each deploy).
- **Netlify** via the Netlify CLI (`netlify deploy --prod`), since git integration
  won't connect a private org repo.

Both self-skip when their tokens are absent, so you can run one, the other, or both.

## Order of operations when you push everything

Because the client pins its submodules, push the **submodule targets before the client
that bundles them**:

1. Push your **sources** repo.
2. Push the **extension** (if changed).
3. Push the **backend**.
4. Push the **client** (which bundles 1 + 2 and talks to 3).

CI for the client resolves the freshest submodule tips, so as long as 1 + 2 are on
their remote before the client build runs, everything lines up.

## Reproducing it for your org

1. Fork/clone all repos into **one** GitHub organisation.
2. Add the `SUBMODULES_TOKEN` secret (read on your private repos).
3. Add the deploy secrets you use: GHCR is automatic; for the proxy add the
   Cloudflare/Netlify secrets + `NITRO_PROXY_SECRET`.
4. Point the deploy steps at your own server/registry (the reference uses a
   self-hosted runner on a jump host with durable `read:packages` login and a
   `deploy.sh` on the managers).
