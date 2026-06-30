---
title: Troubleshooting
description: Common Crimson Haven self-hosting problems and how to fix them — build failures, login walls, mixed content, CORS, and playback issues.
---

When the castle misbehaves, start here. Each entry is *symptom → cause → fix*.

## Build & startup

### The client build fails mentioning `crimson-sources`
**Cause:** the `vendor/crimson-sources` submodule is missing (the build imports it
directly). **Fix:** `git submodule update --init --recursive`, or create the
[empty stub](/self-hosting/sources/#the-empty-stub). In CI, make sure `SUBMODULES_TOKEN`
is set so a *private* submodule can be cloned.

### The backend won't start / can't reach the database
**Cause:** wrong `DATABASE_URL`, or the database isn't up yet. **Fix:** check
`docker compose logs backend`; confirm PostgreSQL is healthy; verify the credentials.
The backend waits up to `DB_CONNECT_TIMEOUT` seconds at boot.

### `docker compose up` ignores my new `.env` values
**Cause:** Compose/Swarm only inject variables **listed** in the service's
`environment:` block; `.env` is used for `${...}` substitution, not auto-injection.
**Fix:** ensure the variable is referenced in the compose file, then recreate the
container (`docker compose up -d`).

## Login & accounts

### Every request returns 401
**Cause:** the members-only login wall (`REQUIRE_LOGIN=true`) with no valid session.
**Fix:** that's expected — log in. To open the API entirely (e.g. a demo), set
`REQUIRE_LOGIN=false`.

### Registration always returns 403
**Cause:** `SIGNUP_INVITE_CODE` is empty (signups closed) or the user didn't enter a
valid code. **Fix:** set `SIGNUP_INVITE_CODE`, recreate the container, and have users
enter it at signup.

### After login I'm immediately logged out (iOS / Safari)
**Cause:** WebKit drops the `Authorization` header when following a redirect, so a
redirected request hits the login wall unauthenticated. **Fix:** this is handled by the
backend serving directly instead of redirecting; if you've customised routing, avoid
301-redirecting authenticated API calls.

## Playback

### Streams are blocked as "mixed content"
**Cause:** the backend emitted `http://` URLs because it didn't see it was behind HTTPS.
**Fix:** make your reverse proxy set `X-Forwarded-Proto: https` (and `X-Forwarded-Host`),
and set `FORWARDED_ALLOW_IPS=*` so uvicorn trusts them.

### "This content is blocked" / CSP errors in the console
**Cause:** the in-browser player must connect to rotating hoster CDNs, which the page's
`connect-src` CSP must allow. **Fix:** the client ships `connect-src 'self' https:` in
`security-headers.conf` for exactly this; if you've tightened it, you'll block playback.
(`script-src` stays strict — only `connect-src` is widened.)

### CORS errors loading `/cache_proxy` or subtitles
**Cause:** a cross-subdomain request became CORS-enforced (e.g. a `<video crossorigin>`
when subtitle tracks are present) and the response lacked the header. **Fix:** ensure
`ALLOWED_ORIGINS` includes your client's exact HTTPS origin and the container actually
sees that value; check the failing request's status (a 404 means the cached file moved /
its target was disabled, not a CORS bug).

### The proxy path does nothing / `/sign` returns 503
**Cause:** `CRIMSON_PROXY_BASE` isn't set on the backend (or wasn't injected into the
container), so the E2 path is disabled. **Fix:** set `CRIMSON_PROXY_BASE` (and make sure
it's in the compose `environment:` block), deploy the proxy with a matching
`NITRO_PROXY_SECRET == PROXY_SECRET`, and recreate the backend.

### Proxy plays sometimes, fails on refresh
**Cause:** one edge host (e.g. Netlify) is unhealthy while another (Cloudflare) works,
and requests were landing randomly. **Fix:** the backend health-checks edges and routes
only to healthy ones — make sure both hosts in `CRIMSON_PROXY_BASE` are actually
deployed and reachable, or list only the working one.

## The companion extension

### The page doesn't detect the extension
**Cause:** it isn't loaded/enabled, or its content script isn't injecting on your
hostname. **Fix:** confirm it's enabled at `chrome://extensions` and shows the current
version; confirm your site's hostname matches the extension's allowed origins (it targets
Crimson origins + `localhost`). In the site console, check
`window.CrimsonExtension?.available`.

### Extension is detected but streams 403 after a few seconds
**Cause:** the header-injection rules were torn down mid-playback. **Fix:** this is
handled by keeping media rules alive through playback (cleared on the *next* episode); if
you've modified the client engine lifecycle, don't dispose the engine on resolve
completion.

### Some hosts fail with "intercepted by a content blocker"
**Cause:** a co-installed blocker (AdGuard/uBlock) is substituting a stub for the media.
**Fix:** the blocker fetches happen in the extension's service worker (no tab context), so
a per-site allowlist may not help — pause the blocker or disable the specific rule.

## Still stuck?

- Re-read the relevant [Self-Hosting Guide](/self-hosting/backend/) page.
- Check `docker compose logs -f` on the backend and client.
- Confirm the [sanity checklist](/deployment/domains/#a-quick-sanity-checklist).
- See the [Glossary](/help/glossary/) if a term is unfamiliar.
