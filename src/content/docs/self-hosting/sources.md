---
title: Adding your own sources
description: How to plug your own private sources engine into Crimson Haven as a git submodule — the public API contract the client expects, and the CI wiring to bundle it.
---

This is the boundary of these archives. The public Crimson Haven stack ships with
**no** streaming sources — the backend scrapes nothing, and the client bundles an
engine that, by default, knows how to find nothing. To get real playback you provide
**your own private sources repository** and bundle it into the client.

This page documents the *mechanism* — the contract your engine must satisfy and how
to wire it in. It deliberately says nothing about what providers to build or how to
scrape any particular site; that is entirely yours to decide and yours to keep private.

:::caution[Your responsibility]
What you put in your sources repository, and whether you have the right to access any
given content, is **your** responsibility and subject to the laws of your
jurisdiction. Crimson Haven is the plumbing; the water is yours to account for.
:::

## How the client consumes sources

The client bundles your engine as a git submodule at **`vendor/crimson-sources`** and
imports its public API through a Vite alias (`crimson-sources` →
`vendor/crimson-sources/src/index.ts`). The TypeScript is transpiled inline at build
time — there's no separate build step for the engine.

The import is direct, but the build **never fails** when the submodule is missing: a
built-in safeguard swaps in a no-op stub so the site builds with no sources (see
[No sources? The build handles it for you](#no-sources-the-build-handles-it-for-you)).
Provide a real engine to get playback.

## The public API contract

Your `src/index.ts` must export the following. This is the entire surface the client
depends on:

```ts
// The factory the client calls once per watch session.
export async function createEngine(env: EngineEnv): Promise<Engine>;

// Companion-extension detection (return null when absent — playback still works).
export function getExtensionBridge(): ExtensionBridge | null;
export async function waitForExtensionBridge(): Promise<ExtensionBridge | null>;
```

### `EngineEnv` — what the client hands your engine

```ts
interface EngineEnv {
  extension: ExtensionBridge | null;            // E3 — the companion, or null
  signProxyUrl?: (f: SignFields) => Promise<string>;  // E2 — mints a signed proxy link via the backend /sign grant
  resolveGrant?: (r: GrantRequest) => Promise<GrantStream[]>;  // backend /resolve grant for secret-bound sources
  debug?: boolean;
}
```

The client supplies `signProxyUrl` and `resolveGrant` for you — they call the
backend's grant endpoints with the session token. Your engine just calls them when a
source needs the edge proxy (E2) or a server-held secret. You never see `PROXY_SECRET`
or any backend secret.

### `Engine` — what `createEngine` returns

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

### `MediaCtx` — what identifies the thing to play

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

### `StreamLine` — what you must yield

The single most important rule: **yield the same line shape the backend's `/watch`
emits**, so a locally-resolved stream is indistinguishable from a backend one and the
player needs no changes.

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
media rules, or a signed proxy link via `signProxyUrl`) is up to your engine — the
[New System](/architecture/new-system/) describes the E1/E2/E3 delivery options.

### Capability flags drive routing (optional but recommended)

If your engine declares, per source, which constraints it needs, it can route each
source to the cheapest environment that can serve it:

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

You decide the flags; the engine decides the placement. A source that can't run in the
current environment is simply skipped, and the backend remains the floor.

## Wiring your repo in as a submodule

Once your private repository implements the contract above, add it to the client:

```bash
cd crimson-client
git submodule add ../crimson-sources vendor/crimson-sources
git commit -m "Bundle private sources engine"
```

Notes:

- **Use a relative URL** (`../crimson-sources`). The client's `.gitmodules` already
  expects this so the submodule resolves to a sibling repo under the **same
  organisation/owner** as the client. Keep all your repos under one org.
- You can pin a branch (e.g. `dev` for staging, `main` for production) in
  `.gitmodules`.

### Making CI bundle a *private* sources repo (env-driven)

The client's build workflow fetches the sources repo **by name from a secret**, so the
repo is never hardcoded into the pipeline — and if the secret is unset (or the clone
fails), the build still succeeds with no sources. Two repository **Actions secrets**:

| Secret | Value | Purpose |
| --- | --- | --- |
| `CRIMSON_SOURCES_REPO` | `your-org/your-sources-repo` | Which repo to bundle. **Unset ⇒ build with no sources.** |
| `SUBMODULES_TOKEN` | a PAT with **read** on that repo | Auth for the clone (a fork's default token can't read a *different* private repo). |

The workflow clones `CRIMSON_SOURCES_REPO` (at `@dev` on a dev push, `@main` on a
release) using `SUBMODULES_TOKEN`, bakes it into the image, and **never fails the build
if it can't** — it just falls back to the no-op stub. (The companion extension used to
be fetched the same way, but it now ships on the Chrome Web Store, so the client no
longer bundles it — that fetch step is left commented in the workflow.)

:::tip[Lumi says]
Because the repo is named by a secret and not written into the workflow, the **same**
public `crimson-client` builds cleanly for everyone: you set the secret and get your
private sources; a fork that doesn't have it gets a working, sources-free site. One
repository, no public/private fork to maintain. ( ^ ▿ ^ )
:::

:::tip[Lumi says]
Keep your sources repository **private**. That's the whole point of the split: the
public projects stay shareable, and the part that actually finds streams stays yours.
:::

## No sources? The build handles it for you

You do **not** need to provide anything to build a sources-free site. The client ships
a built-in safeguard (`src/sourcesStub.js`): when `vendor/crimson-sources` is absent,
`vite.config.js` aliases the `crimson-sources` import to that no-op automatically, so
the build succeeds and the in-browser engine cleanly resolves nothing. The site serves
whatever the backend owns (your Local / Cache / Jellyfin sources).

So a fresh `git clone` of the client builds out of the box — no stub to write, no
submodule to initialise. Add your private sources repo (above) whenever you're ready;
until then, playback falls back to the backend.

> The no-op contract the stub implements is exactly the public API documented above
> (`createEngine` → an engine whose `canRunAny()` is `false`, plus
> `getExtensionBridge` / `waitForExtensionBridge`). Your real engine just makes those
> do something.

## A note on the backend grants

Your engine can lean on three backend endpoints without ever seeing a secret:

- **`/scrape-meta`** — the client calls this for you and enriches `MediaCtx` with
  titles, localized synonyms, release year and IMDb id (these need the server's TMDB
  key).
- **`/sign`** — `env.signProxyUrl(...)` mints a signed edge-proxy link (E2).
- **`/resolve`** — `env.resolveGrant(...)` runs a secret-bound resolve on the backend
  and returns a raw stream URL for your engine to deliver.

The backend ships a small, documented operator-only grant for secret-bound sources;
if you run such a source on your own instance, see
[Operator-owned sources](/reference/operator-sources/).

## Advanced (and not recommended): backend-side E0 sources

Everything above keeps the actual stream-finding **off your server** — it runs in the
viewer's browser (E1), at the edge proxy (E2) or in the companion extension (E3). That
split is deliberate, and it's the recommended way: your backend stays light, your
server's IP never touches a third-party host, and you don't pay the bandwidth.

It is, however, **possible** to bake sources directly into the backend image as well —
**E0** sources that scrape and resolve *on the server* — using the very same
"named-by-a-secret" trick the client uses. The backend build looks for two **Actions
secrets**:

| Secret | Value | Purpose |
| --- | --- | --- |
| `SOURCES_REPO` | `your-org/your-backend-sources` | Which private repo to overlay. **Unset ⇒ a plain image with operator-owned sources only.** |
| `SOURCES_PAT` | a PAT with **read** on that repo | Auth for the clone (mounted as a BuildKit secret — never baked into a layer). |

When both are set, the build clones that repo and drops its modules into the backend's
`scrapers/` and `resolvers/` packages; they're auto-discovered and registered at boot.
A runtime kill-switch, `PRIVATE_SOURCES_ENABLED=0`, disables them without a rebuild.
Like the client, the **same public backend** builds cleanly for everyone — a fork with
no secret simply gets the base image.

:::danger[Lumi says: think twice]
E0 puts the scraping back **on your server** — the exact thing the E1–E3 split exists to
avoid. It costs you bandwidth, CPU, and exposes your server's IP to whatever it fetches,
and it's heavier to keep alive when an upstream rotates. Your operator-owned **Local /
Cache / Jellyfin** sources always stay preferred regardless, so reach for E0 only for the
narrow case it's meant for: a device that genuinely can't run the client engine or the
extension (an old TV browser, say) and where you accept the server-side cost. If you can
run sources client-side, do — your future self (and your bandwidth bill) will thank you. ( ˶ ˆ ᗜ ˆ ˶ )
:::

:::tip[Lumi says]
As with the client, keep that backend-sources repository **private**, and remember the
backend never documents the individual sources it loaded — they're yours, undocumented
by design, and this page is the only place the door is even mentioned.
:::
