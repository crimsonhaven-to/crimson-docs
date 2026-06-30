---
title: The companion extension
description: What the crimson-extension companion does, how it's distributed to your visitors, and how it makes playback the fastest and most direct.
---

The companion is a tiny Chromium (Chrome / Edge, Manifest V3) browser extension. Its
**only** job is local **CORS unblock + header injection**, so the in-browser sources
engine can resolve gated streams and play them **straight from the CDN to the
viewer** — no backend, no proxy in the byte path.

One red button. Press **Use Extension**; everything else happens in the background.

## Why it's the best playback path

A plain browser can't read most cross-origin responses (CORS) or set `Referer` /
`Origin` / `User-Agent` headers. The proxy solves that but is a datacenter IP. The
extension solves all of it from a **real browser on the viewer's own connection**:

| Capability | Proxy (E2) | **Extension (E3)** |
| --- | --- | --- |
| Read cross-origin responses | ✅ relay | ✅ host access |
| Inject forbidden headers | ✅ | ✅ |
| Pass anti-bot fingerprint checks | ❌ datacenter | ✅ real browser |
| Mint IP/ASN-bound tokens correctly | ❌ wrong IP | ✅ viewer's IP |
| Video bytes off your backend | ✅ via edge | ✅ **direct CDN → viewer** |

It holds **no secrets**, signs nothing, and knows nothing source-specific — the page
(your sources engine) drives it. While toggled off, it answers handshakes (so the
page knows it exists) but does no work.

## It has no build step

The extension is plain JS/CSS/JSON — no bundler. You can load it unpacked:

1. Visit `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select the `crimson-extension/` folder.
3. Open your Haven, click the toolbar sigil, press **Use Extension**.

## Distributing it to your visitors

Because the repo is private (no public store listing), the client **ships the
companion itself**, exactly like a download:

- The client vendors `crimson-extension` as the `vendor/crimson-extension` submodule.
- Its Docker build zips the submodule into a downloadable archive.
- A themed **`/extension`** page on your site offers the download + a short side-load
  guide, and a home-page banner nudges visitors who don't have it yet (auto-hidden
  once it's detected).

So as a self-hoster you don't distribute anything by hand — build the client with the
extension submodule present and the download page appears. Make sure the submodule is
checked out at build time (the [CI/CD pipeline](/deployment/cicd/) does this with the
submodule token).

## Three capabilities (for the curious)

1. **Privileged fetch** — a cross-origin fetch from the extension's service worker
   (no CORS wall) that injects the headers a page can't set itself.
2. **Media unblock rules** — declarative header injection + permissive CORS on the
   page's own `hls.js` / `<video>` fetches, so the player streams gated CDN segments
   directly.
3. **Hidden-tab capture** — a last resort for the trickiest hosters: it opens the
   embed in a background tab, watches the network for the real media URL, and closes
   the tab. The page reverses nothing.

## Security posture

- Loads only on Crimson origins; the in-page API exposes fetch/rule primitives only.
- Holds no secrets — secret-bound sources stay on the backend.
- Fully user-toggled. It's a pure upgrade: absent or off, your sources engine falls
  back to the proxy (E2) or backend (E0).

:::tip[Lumi says]
Browser support is **Chromium** (Chrome / Edge) for now. Visitors on other browsers
simply use the proxy / backend paths — they still watch, just with a little more of
the bytes passing through the edge.
:::
