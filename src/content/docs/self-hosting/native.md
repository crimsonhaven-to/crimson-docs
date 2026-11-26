---
title: The native app (desktop and mobile)
description: How crimson-native wraps crimson-client in Electron and Capacitor for durable downloads, a built-in companion bridge, multi-backend selection, and private member-only releases.
---

`crimson-native` is an optional native shell around the unmodified
[crimson-client](/self-hosting/client/) build (app id `to.crimsonhaven.app`). You
point it at any Crimson backend, official or self-hosted, and it behaves like the
web app with the [companion extension](/self-hosting/extension/) already installed.

## What it is and why

A browser PWA can play video and save offline copies, but browsers impose three
hard limits. The native shell removes all three without rewriting the frontend:

| Gap in the PWA | What the native shell does instead |
| --- | --- |
| The browser can evict downloaded music and episodes | Stores downloads as real files on disk |
| Scraping gated sources needs the browser extension | Provides `window.CrimsonExtension` itself (protocol 2, always on) |
| The backend URL is baked into the client at build time | Lets you pick a backend at first launch and switch later |

Desktop uses **Electron** rather than Tauri for two practical reasons: the
companion primitives (privileged fetch with forbidden headers, per-window header
and CORS rules, and hidden-page stream capture) map directly onto Chromium's
session APIs, and Electron bundles the same Chromium media stack (H.264 and AAC)
and Chrome TLS fingerprint on every OS. Mobile uses **Capacitor** to host the same
Vite client build inside the platform WebView with a native bridge per OS.

## How it fits together

The client keeps all product logic. The shell provides capabilities over IPC and
nothing else.

```text
+--------------------------- Electron app ----------------------------+
|                                                                     |
|  Renderer: app://crimson/  (bundled crimson-client, unchanged UI)   |
|   |- crimson-sources engine  -- window.CrimsonExtension --+         |
|   |- offline stores          -- window.CrimsonNative -----+         |
|   +- hls.js / <video> / <audio>                           | IPC     |
|                                                           v         |
|  Preload (contextBridge): exposes the two globals and injects       |
|  apiBaseUrl before any page script runs                             |
|                                                           |         |
|  Main process                                             v         |
|   |- protocol    app:// serves the bundled client + history fallback|
|   |- backends    saved list, probe, per-backend session             |
|   |- cors        adds CORS headers for the chosen backend only      |
|   |- bridge/     fetch, mediaRules, resolveInPage                   |
|   |- media/      downloads as real files, Range on app://           |
|   |- discord/    direct Discord IPC (Unix socket / named pipe)      |
|   |- spotify     loopback redirect for PKCE                         |
|   +- updater     members-only updates from the connected backend    |
+---------------------------------------------------------------------+
        | HTTPS (bearer token)                  | HTTPS (Chrome stack)
        v                                       v
  Chosen crimson-backend                 Third-party sources, CDNs,
  (official or self-hosted)              crimson-proxy (E2 fallback)
```

### Security and CORS

- The renderer runs with `contextIsolation`, `sandbox`, and no `nodeIntegration`.
  Only `window.CrimsonExtension` and `window.CrimsonNative` are exposed.
- The main window only loads the client from `app://`. External top-level links
  open in the system browser.
- Companion `fetch` is injected into the main frame only (not iframes), and its
  IPC handlers reject callers other than the client page. Capture windows are
  sandboxed, muted, and block popups.
- Content-Security-Policy headers come from the client's `security-headers.conf`,
  with plain `http` backends relaxed when you explicitly add one on a LAN.
- **CORS on desktop:** `crimson-backend` checks `ALLOWED_ORIGINS` by exact match,
  so `app://crimson` is not listed on existing deployments. The desktop shell
  injects `Access-Control-Allow-Origin: app://crimson` on responses from the
  chosen backend origin only (`session.webRequest.onHeadersReceived`). Because
  auth uses a bearer token rather than cookies, self-hosters do not need to edit
  `ALLOWED_ORIGINS` for desktop users.
- **CORS on mobile:** `crimson-backend` 18.8.0 and newer automatically allow
  `https://*.crimsonhaven.localhost` and `capacitor://*.crimsonhaven.localhost`
  so mobile installs work against any up-to-date backend without extra config.

## The two globals

Every shell (desktop and mobile) exposes the same two globals before any client
script runs. The client checks for them with feature detection and never needs to
know which shell hosts it.

### `window.CrimsonExtension`

Implements protocol 2 of the companion extension (`ExtensionBridge`). It is always
enabled, sets `document.documentElement.dataset.crimsonExt` at
`DOMContentLoaded`, and lets `crimson-sources`, Live TV, and manga run at E3
unchanged. All sessions send a plain Chrome user agent so hosters do not flag
Electron's default user agent.

| Primitive | Desktop (Electron) implementation |
| --- | --- |
| `fetch(url, opts)` | `session.fetch` on `persist:scraper` (its own cookie jar and Chromium's network stack, giving a real Chrome TLS fingerprint). Forbidden request headers are applied in `onBeforeSendHeaders`, and manual or followed redirects are recovered via `onBeforeRedirect`. |
| `installMediaRules` / `clearMediaRules` | Per-window rule table applying request headers in `onBeforeSendHeaders` and replacing CORS headers in `onHeadersReceived` (preflights return `204`). Cleared on `hello()`, page reload, and window close. |
| `resolveInPage(url, opts)` | Hidden `BrowserWindow` on `persist:scraper` with `backgroundThrottling: false` so visible-only players start without showing a window. Runs the extension's `nudge.js` in every frame, denies popups, and captures the first matching media request (25 s default timeout, 40 s max). |

### `window.CrimsonNative`

Exposed only by native shells. When it is absent, the client runs in standard
browser mode.

| Property / namespace | What it provides |
| --- | --- |
| `platform`, `appVersion`, `apiBaseUrl` | Shell platform (`windows`, `linux`, `macos`, `android`, `ios`), app version, and the active backend URL (read by the client instead of `VITE_API_BASE_URL`). |
| `backends` | `list()`, `current()`, `open(id)` (reloads into that backend's session), and `manage()` (opens the connect page). |
| `media` | Streamed file writes (`begin`, `append`, `finish`, `abort`), management (`keys`, `remove`, `clear`, `usage`), moving the download folder (`chooseRoot`), and native save dialogs (`saveAs`). |
| `discord` | `setActivity(clientId, activity)` over Discord's local IPC. |
| `desktop` | `report({ playing, downloading })` for hide-to-tray, `notify(title, body)` for native notifications, and `onTrayAction(cb)` for tray media buttons. |
| `spotify` | `redirectUri` (`http://127.0.0.1:43821/music/connect`) and `authorize(url)` for the loopback PKCE callback. |

## First launch and backend selection

1. On first launch, the shell opens a small local connect page instead of the
   client. Later launches skip straight to the last used backend.
2. You enter a backend URL. If you omit the scheme, the shell tries `https` first
   and then `http` (for LAN self-hosters).
3. The shell probes `GET /` (which must return `version`) and `GET /config`
   (feature flags and `require_login`), shows the backend version and enabled
   features, and saves the entry to `backends.json` in the app's user data folder
   (`~/.config/Crimsonhaven` on Linux, `%APPDATA%\Crimsonhaven` on Windows).
4. If the backend is older than `expectedBackendVersion` (recorded at build time
   from the backend release the bundled client targets), the shell shows a
   non-blocking warning during setup and a dismissible banner on launch.
5. Each saved backend opens in its own Electron session, `persist:backend-<id>`.
   `localStorage`, Cache Storage, and IndexedDB stay completely isolated per
   backend, so accounts, settings, and download lists never mix.

Switching backends from client settings calls `CrimsonNative.backends.open(id)`,
which reloads the window into the target backend's session.

## Downloads as real files

On the web, [offline downloads](/self-hosting/offline-downloads/) and saved music
live in browser Cache Storage, which browsers can evict under storage pressure.
In the native app, the client's storage adapter (`src/deviceCache.js`) routes the
exact same cache names and keys to real files on disk.

| Piece | How it works |
| --- | --- |
| Layout | `<root>/<backend id>/<cache name>/<key>`, matching the client's Cache Storage names and keys. |
| Folder | `<userData>/Downloads` by default (never touched by app updates or cache clears). `chooseRoot` moves all stored files into `<chosen>/Crimsonhaven` (rename on the same drive, copy then delete across drives) and saves the path in `media.json`. |
| Writes | Streamed over IPC in 1 MB batches into `<file>.part` and renamed on `finish`, so an interrupted download never looks complete. |
| Reads | The shell's `app://crimson` handler serves `/video-offline/*` and `/music-offline/*` straight from disk with HTTP `Range` support (and optional `?cache=<name>`), replacing the web service worker so `<img>`, `hls.js`, and `<video>` work unchanged. |
| Index | Kept in the client's `localStorage` inside each backend's isolated session, just like on the web. |

## Desktop integration

| Feature | Behaviour |
| --- | --- |
| Media keys and OS controls | Chromium maps Media Session to SMTC on Windows and MPRIS on Linux. Watch pages set title metadata and hand keys back when closed. |
| Discord presence | The main process speaks Discord IPC directly over a Unix socket or Windows named pipe. No separate helper binary and no open local port. |
| Spotify import | Opens Spotify consent in your system browser and catches the loopback redirect on `http://127.0.0.1:43821/music/connect`, then continues on the client's normal callback route. |
| Save stream to file | Opens a native save dialog (`saveAs`) and writes using the same streamed `.part` path as offline downloads. |
| Single instance and deep links | Launching a second instance focuses the existing window. `crimsonhaven://<path>` maps to `app://crimson/<path>`. |
| Right-click menu | Cut, copy, paste, open link in browser, and copy image. |
| Tray and background work | The client reports when music is playing or a download is active. Closing the window hides it to the system tray so playback and downloads keep running. Tray buttons control music, and finished downloads post a native notification. |
| Hardware video decoding | Enabled by default in Electron (including VA-API on Linux). |
| Offline start | Because the client bundle ships inside the app, it opens without a network connection and saved downloads stay playable. |

## Mobile (Android and iOS)

The mobile apps live in `mobile/` as Capacitor projects around the same compiled
`crimson-client` bundle, connect page, and extension `nudge.js`. Each platform
implements `window.CrimsonExtension` and `window.CrimsonNative` natively, omitting
desktop-only namespaces (`saveAs`, `discord`, `spotify`, `desktop`).

### Android (built and verified on an emulator)

Android targets **Android 8.0+ (API 26)** on Capacitor 8 and has been built and
verified end to end on an Android 16 emulator.

| Area | Android implementation |
| --- | --- |
| Per-backend origins | Each backend gets its own origin, `https://b-<id>.crimsonhaven.localhost`, keeping logins, settings, and downloads separate. Switching backends recreates the activity with the other origin. |
| Companion `fetch` | Implemented on `HttpURLConnection` with an app-lifetime cookie jar, custom headers, and manual/followed redirects. Because it does not use Chromium's TLS stack, sources marked `needsJA3` may fall back to the proxy or backend. |
| Media rules | Matching subresource `GET` requests are re-issued with the rule's headers and returned with CORS headers. |
| `resolveInPage` | Hidden WebView behind the page with `nudge.js` injected at document start in every frame; popups are blocked and the first matching media request wins. |
| Downloads | Stored under `<app storage>/media/<backend>/<cache>/<key>` using `.part` writes and served on the page's origin with `Range`. No `chooseRoot` is needed because Android does not evict app storage. |
| Media Session and background audio | Because Android WebView lacks `navigator.mediaSession`, the shim provides it and mirrors state into native Android Media Session (notification, lock screen, and Bluetooth controls). While playing, a `mediaPlayback` foreground service holds a wake lock and Wi-Fi lock so the next track starts with the screen off. After pausing, it leaves the foreground after 60 s while keeping the notification. Unplugging headphones pauses playback. |

### iOS (written, not yet compiled or run)

The iOS port (`mobile/ios`, Capacitor with Swift Package Manager, **iOS 15+**)
mirrors the Android classes in Swift and has been typechecked on Linux against API
stand-ins, but has **not yet been compiled with Xcode or run on a device**.

- **Per-backend origins:** `capacitor://b-<id>.crimsonhaven.localhost` (already
  accepted by `crimson-backend`).
- **WKWebView media proxy:** WebKit cannot modify `http(s)` requests directly, so
  the shim rewrites matching `GET` requests (`fetch`, XHR, media `src`) from
  `https://` to a custom `crimson-proxy://` scheme. Native Swift re-issues those
  requests with the rule's headers and CORS headers. Requests inside embedded
  iframes are not covered.
- **Downloads and audio:** Files live in `Application Support/media/` (excluded
  from iCloud backup) with chunked `Range` responses and byte-sniffed
  `Content-Type`. Lock screen controls use `NowPlaying` with the `audio`
  background mode.
- **Sideloading only:** An app that scrapes third-party streams will not pass App
  Store review. Running on iOS requires sideloading (for example AltStore or
  SideStore, re-signed every 7 days with a free Apple account) or ad hoc /
  TestFlight builds with a paid Apple Developer account.

## Releases and updates

Installers are never hosted publicly because the bundled client contains the
private `crimson-sources` engine. Distribution flows through a private package
registry proxied by `crimson-backend` to signed-in members only.

### Build and private registry

1. Pushing a `v<semver>` tag on `crimson-native` triggers CI builds for Linux
   (`AppImage`, `.deb`, `.rpm`), Windows (NSIS installer built through Wine), and
   Android (signed `.apk`).
2. Each build job uploads its files to the generic package registry of the
   **private** project `crimson-native-releases` (package `crimsonhaven`) under
   the tagged version.
3. The publish job writes `release.json`, copies the files into `latest` under
   version-free names (for example `Crimsonhaven-Setup.exe`,
   `Crimsonhaven-x86_64.AppImage`), rewrites the `electron-updater` feed files
   (`latest*.yml`) to match, and creates a private GitLab release linking the
   versioned files.

:::caution[Keep installers on a private project]
GitLab serves generic packages of a **public** project to anyone regardless of the
package registry's visibility setting. Never publish installers to a public
project, and keep the package registry disabled on `crimson-native` itself.
:::

### Backend proxy (`app_engine`)

`crimson-backend` is the only reader of the private release registry. It reads
`APP_RELEASES_URL` and `APP_RELEASES_TOKEN` (a read-only project access token) and
exposes three routes under `/app`:

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /app/release` | Signed-in member (bearer token) | Returns the current release version, date, and file list with signed download URLs for the website's Desktop App card. |
| `GET /app/updates/<file>` | Signed-in member (bearer token) | `electron-updater` generic provider feed. The desktop app polls `<backend>/app/updates` 15 s after startup and every 6 hours. |
| `GET /app/download/<name>?e=&s=` | Signed link (24-hour expiry) | Serves an installer as a file download for plain browser navigation (which cannot attach a bearer header). Links are minted only by `/app/release`. |

The backend caches `release.json` per replica for 5 minutes. Installer downloads
stream straight through from upstream, so a ~100 MB file is never buffered in
memory.

### Installing and updating

| Platform | Package | Notes |
| --- | --- | --- |
| Windows | `Crimsonhaven-Setup-<version>.exe` | Unsigned: SmartScreen prompts "More info", then "Run anyway". Auto-updates through `/app/updates`. |
| Linux (any distro) | `Crimsonhaven-<version>-x86_64.AppImage` | Mark executable (`chmod +x`) and run. Updates itself in place. |
| Debian / Ubuntu | `crimsonhaven_<version>_amd64.deb` | Install with `sudo apt install ./crimsonhaven_<version>_amd64.deb`. Updates via a polkit prompt. |
| Fedora / openSUSE | `crimsonhaven-<version>.x86_64.rpm` | Install with `sudo dnf install ./crimsonhaven-<version>.x86_64.rpm`. Updates via a polkit prompt. |
| Android | `Crimsonhaven-<version>.apk` | Allow installing from your browser when prompted. No in-app updater yet: download the newer APK from the website's app card and install it over the previous one. Android requires the same signing key for upgrades, so the release keystore must never be lost. |
| macOS | Not built yet | Needs a macOS runner; unsigned macOS builds cannot auto-update. |

## Self-hosting and offering the app

On the backend, desktop app downloads and updates are controlled by two
environment variables (see [Backend environment](/reference/backend-env/#desktop-app-releases)):

- **`APP_RELEASES_URL`**: base URL of the private generic package `latest` folder
  (no trailing slash).
- **`APP_RELEASES_TOKEN`**: a read-only project access token sent as a bearer
  token when the backend fetches the manifest and installers.

When `APP_RELEASES_URL` is unset (the default), `GET /config` reports
`desktop_app: false`, the website hides the download card, and `/app/*` returns
`503`. The official Crimson Haven instance is the only one that serves prebuilt
installers; self-hosted backends do not need to configure these variables unless
you build and host your own private release registry. Members using the app can
still connect it to any self-hosted backend.

### Building from source

Clone with recursive submodules so `crimson-client`, `crimson-extension`, and
(if you have access) your private `crimson-sources` come along:

```bash
git clone --recursive https://gitlab.ramon.moe/crimsonhaven-to/crimson-native.git
cd crimson-native
npm install
npm run build:client
npm start
```

Use `npm run dist` to package desktop installers into `release/`. For Android, run
`npm run build:client && npm run build` in the repo root, `npm run sync` in
`mobile/`, and `./gradlew assembleDebug` inside `mobile/android` (requires JDK 21
and Android SDK platform 36).

## Limits and honest caveats

- **Unsigned desktop builds:** Windows shows a SmartScreen prompt on first run.
  macOS installers are not built yet (no macOS runner), and unsigned macOS builds
  cannot auto-update.
- **Full downloads (~100 MB):** Differential updates are off because the backend
  does not forward `Range` on `/app/updates`, so every desktop update downloads
  the full installer. Electron also uses more idle RAM than a native binary.
- **Private distribution only:** Because the bundled client includes private
  `crimson-sources`, installers cannot be published on public release pages or
  public package registries.
- **iOS status:** Written and typechecked against stand-ins, not yet compiled in
  Xcode or tested on hardware, and limited to sideloading due to App Store review
  policies.
- **Mobile TLS fingerprinting:** Android and iOS use the platform HTTP client for
  companion `fetch` rather than Chromium's network stack, so sources that require
  a Chrome TLS fingerprint (`needsJA3`) may fall back to the proxy or backend.

:::tip[Lumi says]
You do not need to publish installers on a self-hosted Haven. Leave
`APP_RELEASES_URL` unset on your backend and anyone who already has the app can
still add your server from the connect page.
:::
