---
title: Adding your own sources
description: How to plug your own private sources engine into Crimson Haven as a git submodule, the API contract the client expects, and the CI wiring that bundles it.
---

The public Crimson Haven stack ships with **no** streaming sources: the backend
scrapes nothing, and by default the client bundles an engine that finds nothing. For
real playback you provide **your own private sources repository** and bundle it into
the client.

This page documents the *mechanism*: the contract your engine must satisfy and how to
wire it in. It says nothing about which providers to build or how to scrape any
particular site. That is yours to decide and to keep private.

:::caution[Your responsibility]
What you put in your sources repository, and whether you have the right to access any
given content, is **your** responsibility and subject to the laws of your
jurisdiction. Crimson Haven is the plumbing; the water is yours to account for.
:::

## How the client consumes sources

The client bundles your engine as a git submodule at **`vendor/crimson-sources`** and
imports its public API through a Vite alias (`crimson-sources` →
`vendor/crimson-sources/src/index.ts`). Vite transpiles the TypeScript at build time,
so the engine has no build step of its own.

The build **never fails** when the submodule is missing: a no-op stub takes its place
and the site builds with no sources (see
[No sources? The build handles it for you](#no-sources-the-build-handles-it-for-you)).

## The public API contract

Your `src/index.ts` must export the following for video playback:

```ts
// The factory the client calls once per watch session.
export async function createEngine(env: EngineEnv): Promise<Engine>;

// Companion-extension detection (return null when absent; playback still works).
export function getExtensionBridge(): ExtensionBridge | null;
export async function waitForExtensionBridge(): Promise<ExtensionBridge | null>;
```

The manga reader also imports `createMangaEngine`; see
[The reading surface (manga)](/self-hosting/manga/).

### `EngineEnv`: what the client hands your engine

```ts
interface EngineEnv {
  extension: ExtensionBridge | null;            // E3: the companion, or null
  signProxyUrl?: (f: SignFields) => Promise<string>;  // E2: mints a signed proxy link via the backend /sign grant
  resolveGrant?: (r: GrantRequest) => Promise<GrantStream[]>;  // backend /resolve grant for secret-bound sources
  debug?: boolean;
}
```

The client supplies `signProxyUrl` and `resolveGrant`. They call the backend's grant
endpoints with the session token; your engine calls them when a source needs the edge
proxy (E2) or a server-held secret. Your engine never sees `PROXY_SECRET` or any other
backend secret.

### `Engine`: what `createEngine` returns

```ts
interface Engine {
  // Which sources could run for this request, given the current environment.
  capabilities(ctx: { mediaType: "tv" | "movie" }): Record<string, unknown>;

  // Quick yes/no: is there at least one runnable source? If false, the client
  // doesn't even start the local engine and relies entirely on the backend.
  canRunAny(ctx: { mediaType: "tv" | "movie" }): boolean;

  // The heart: resolve sources for an episode/movie and YIELD stream lines as they
  // come, exactly like the backend's /watch NDJSON.
  streamEpisode(
    ctx: MediaCtx,
    opts: { signal?: AbortSignal },
  ): AsyncIterable<StreamLine>;

  // Tear down any installed extension media rules / resources.
  dispose(): Promise<void>;
}
```

### `MediaCtx`: what identifies the thing to play

```ts
interface MediaCtx {
  tmdbId: number;
  mediaType: "tv" | "movie";
  season?: number;
  episode?: number;
  // Enriched by the client from the backend /scrape-meta grant (server TMDB key):
  title?: string;
  titleEnglish?: string;
  titleRomaji?: string;
  titleNative?: string;
  synonyms?: string[];
  releaseYear?: number;
  imdbId?: string;
}
```

### `StreamLine`: what you must yield

**Yield the same line shape the backend's `/watch` emits**, so a locally resolved
stream is indistinguishable from a backend one and the player needs no changes.

```ts
interface StreamLine {
  type: "stream";
  source: string;                       // display label, e.g. "Example (1080p)"
  streamType: "hls" | "mp4" | "iframe";
  url: string;                          // a URL the player can load directly
  language?: string | null;             // dub/sub label, or null
  subtitles?: SubtitleTrack[] | null;
}
```

How you turn a raw CDN URL into a player-ready `url` (a direct CDN link plus extension
media rules, or a signed proxy link via `signProxyUrl`) is up to your engine. The
[New System](/architecture/new-system/) describes the E1/E2/E3 delivery options.

### Capability flags drive routing (optional but recommended)

If your engine declares which constraints each source needs, it can route each source
to the cheapest environment that can serve it:

```ts
interface SourceFlags {
  needsCORSBypass?: boolean;     // C1 → proxy (E2) or extension (E3)
  needsHeaderInjection?: boolean; // C2 → proxy or extension
  needsJA3?: boolean;            // C3 → extension only (never the edge)
  needsResidentialIP?: boolean;  // C4 → extension only
  needsServerSecret?: boolean;   // C5 → backend /resolve grant
  needsEdgeSecret?: boolean;     // → proxy edge only (e.g. an edge-held token)
}
```

You set the flags; the engine decides the placement. A source that cannot run in the
current environment is skipped, and the backend remains the floor.

## Wiring your repo in as a submodule

Once your private repository implements the contract above, add it to the client:

```bash
cd crimson-client
git submodule add ../crimson-sources vendor/crimson-sources
git commit -m "Bundle private sources engine"
```

Notes:

- **Use a relative URL** (`../crimson-sources`). The client's `.gitmodules` already
  expects it, so the submodule resolves to a sibling repo under the **same
  group/owner** as the client. Keep all your repos under one group.
- The engine is single-branch: both the staging and the production client build
  bundle `main`. A production release pins it by baking that tip into the immutable
  image it publishes, not by tracking a second branch.

### Making CI bundle a *private* sources repo (env-driven)

The client's GitLab pipeline does not use the committed submodule pointer. It clones
the sources repo fresh at build time, **named by a CI/CD variable**:

| Variable | Value | Purpose |
| --- | --- | --- |
| `CRIMSON_SOURCES_REPO` | `your-group/your-sources-repo` | Which repo to bundle. The pipeline defaults it to `crimsonhaven-to/crimson-sources`; override it on your client project. **Empty or unreachable ⇒ build with no sources.** |

There is no token to set. The clone authenticates with the pipeline's own
`CI_JOB_TOKEN`, so on the *sources* project add the client under **Settings > CI/CD >
Job token permissions**.

Every channel (staging push, `v*` tag, manual run) clones `main`. If the clone fails,
the build **does not fail**: it falls back to the no-op stub. The companion extension
is not fetched; it ships on the Chrome Web Store.

The sources repo's own pipeline triggers a client rebuild: a push to `main` rebuilds
staging and a `v*` tag rebuilds production. For that trigger, add the sources project
to the *client's* job token allowlist as well.

:::tip[Lumi says]
Because the repo is named by a variable and the fetch is best-effort, the **same**
public `crimson-client` builds for everyone: point the variable at your private
sources and you get them; a fork without access gets a working, sources-free site. One
repository, no public/private fork to maintain. ( ^ ▿ ^ )

Keep your sources repository **private**. That is the point of the split: the public
projects stay shareable, and the part that finds streams stays yours.
:::

## No sources? The build handles it for you

You do **not** need to provide anything to build a sources-free site. When
`vendor/crimson-sources` is absent, `vite.config.js` aliases the `crimson-sources`
import to the client's no-op stub (`src/sourcesStub.js`). The build succeeds, the
in-browser engine resolves nothing, and the site serves whatever the backend owns
(your Local / Cache / Jellyfin sources).

A fresh `git clone` of the client builds as is: no stub to write, no submodule to
initialise. Until you add your private sources repo, playback falls back to the
backend.

> The stub implements the public API documented above (`createEngine` returns an
> engine whose `canRunAny()` is `false`, plus `createMangaEngine`,
> `getExtensionBridge` and `waitForExtensionBridge`). Your real engine makes those do
> something.

## A note on the backend grants

Your engine can lean on three backend endpoints without ever seeing a secret:

| Grant | How your engine uses it |
| --- | --- |
| **`/scrape-meta`** | The client calls it for you and enriches `MediaCtx` with titles, localized synonyms, release year and IMDb id (these need the server's TMDB key). |
| **`/sign`** | `env.signProxyUrl(...)` mints a signed edge-proxy link (E2). |
| **`/resolve`** | `env.resolveGrant(...)` runs a secret-bound resolve on the backend and returns a raw stream URL for your engine to deliver. |

If you run a secret-bound source on your own instance, see
[Operator-owned sources](/reference/operator-sources/).

## Advanced (and not recommended): backend-side E0 sources

Everything above keeps stream-finding **off your server**: it runs in the viewer's
browser (E1), at the edge proxy (E2) or in the companion extension (E3). That is the
recommended setup. Your backend stays light, your server's IP never touches a
third-party host, and you do not pay for the bandwidth.

You *can* also bake **E0** sources, which scrape and resolve on the server, into the
backend image. Like the client, the backend build names the repo with one **CI/CD
variable**:

| Variable | Value | Purpose |
| --- | --- | --- |
| `SOURCES_REPO` | `your-group/your-backend-sources` | Which private project to overlay. **Unset ⇒ a plain image with operator-owned sources only.** |

There is no token to set. The clone authenticates with the pipeline's own
`CI_JOB_TOKEN`; on the *overlay* project, add the backend under **Settings > CI/CD >
Job token permissions**. The token and the clone target reach the build as BuildKit
secrets, mounted for a single `RUN` and never baked into a layer.

When `SOURCES_REPO` is set, the build clones that project's `main` and copies its
modules into the backend's `scrapers/` and `resolvers/` packages (and any `manga/`
module into `manga_engine/`). They are discovered and registered at boot.
`PRIVATE_SOURCES_ENABLED=0` disables them at runtime without a rebuild. A fork with no
variable gets the plain public image.

Unlike the client, a `SOURCES_REPO` that is set but unreachable **fails the build**
instead of producing a sourceless image: if you asked for the overlay, you want to
hear that it could not be fetched.

:::danger[Lumi says: think twice]
E0 puts the scraping back **on your server**, which is what the E1–E3 split exists to
avoid. It costs bandwidth and CPU, exposes your server's IP to whatever it fetches, and
needs more upkeep when an upstream changes. Your operator-owned **Local / Cache /
Jellyfin** sources stay preferred regardless. Use E0 only for a device that cannot run
the client engine or the extension (an old TV browser, say), and only if you accept the
server-side cost. If you can run sources client-side, do. ( ˶ ˆ ᗜ ˆ ˶ )
:::

:::tip[Lumi says]
Keep that backend-sources repository **private** too. The backend never documents the
individual sources it loaded: they are yours, undocumented by design.
:::
