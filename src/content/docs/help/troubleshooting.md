---
title: Troubleshooting
description: Common self-hosting problems and their fixes, from build failures and the login wall to mixed content, CORS and playback.
---

Each entry is *symptom → cause → fix*.

## Build & startup

### The client built, but has no sources / playback
**Cause:** `vendor/crimson-sources` wasn't present at build time, so the safeguard
bundled the no-op stub (the build log says *"bundling the no-op stub"*). That's expected
for a sources-free site. **Fix (if you wanted sources):** set the `CRIMSON_SOURCES_REPO`
CI/CD variable to your private sources repo, allow the client project under the sources
repo's **Settings › CI/CD › Job token permissions** (the clone uses `CI_JOB_TOKEN`), and
rebuild. See [Adding your own sources](/self-hosting/sources/#making-ci-bundle-a-private-sources-repo-env-driven).
The build never *fails* over missing sources; it falls back to the stub.

### The backend won't start / can't reach the database
**Cause:** wrong `DATABASE_URL`, or the database isn't up yet. **Fix:** check
`docker compose logs backend`; confirm PostgreSQL is healthy; verify the credentials.
The backend waits up to `DB_CONNECT_TIMEOUT` seconds at boot.

### The log warns that `pg_trgm` was not created
**Cause:** the database role may not create extensions, which on PostgreSQL 13+ needs
ownership of the database even for a trusted extension like `pg_trgm`. **Fix:** it's a
note, not an incident. Anime search works identically without it, only slower, and the
refusal is caught so it can't roll back the rest of the migration batch. Grant the app
role ownership of its database (or create the extension yourself as a superuser) if
you want the index. See
[Versioned migrations](/self-hosting/database/#versioned-migrations).

### `/health` reports a migration checksum mismatch
**Cause:** a migration file that was already applied has been edited since, so some
databases ran the old text. **Fix:** it is reported rather than fatal on purpose, since
refusing to boot over a whitespace change turns bookkeeping into an outage. Restore the
file to what was applied, or add a **new** numbered migration for the change you wanted.

### `docker compose up` ignores my new `.env` values
**Cause:** Compose/Swarm only inject variables **listed** in the service's
`environment:` block; `.env` is used for `${...}` substitution, not auto-injection.
**Fix:** ensure the variable is referenced in the compose file, then recreate the
container (`docker compose up -d`).

## Login & accounts

### Every request returns 401
**Cause:** the members-only login wall (`REQUIRE_LOGIN=true`) with no valid session.
**Fix:** that's expected: log in. To open the API entirely (e.g. a demo), set
`REQUIRE_LOGIN=false`.

### Registration always returns 403
**Cause:** the code the user entered is neither one of the `SIGNUP_INVITE_CODE` values
nor an unused single-use invite from the Discord bot. With `SIGNUP_INVITE_CODE` empty,
only bot invites work. **Fix:** set `SIGNUP_INVITE_CODE` (comma-separated for several),
recreate the container, and have users enter it at signup.

### After login I'm immediately logged out (iOS / Safari)
**Cause:** WebKit drops the `Authorization` header when following a redirect, so a
redirected request hits the login wall unauthenticated. **Fix:** this is handled by the
backend serving directly instead of redirecting; if you've customised routing, avoid
301-redirecting authenticated API calls.

## The airing calendar

### Nobody receives the "new episode aired" email
**Cause:** in order of likelihood, `AIRING_NOTIFY_ENABLED` is off (the default),
`AIRING_NOTIFY_DRY_RUN` is still on, `SMTP_*` isn't configured, the flags aren't in
the compose `environment:` block, or no replica has `RUN_DB_SYNC=true`. **Fix:** check
the startup log, which states the feature in three ways: *off*, a loud warning that a
dry run reaches nobody, or nothing at all when it is live. Remember only accounts with
a **verified** email are ever mailed. See
[The airing calendar](/self-hosting/airing-calendar/#turning-the-email-on).

### A member followed a title and still got nothing
**Cause:** most often the account has no verified email (mnemonic accounts never do),
or that follow was made with `notify_email` off. **Fix:** `GET /account/subscriptions`
answers both: `email_notifications` is the account-level answer, and each subscription
carries its own `notify_email`. The calendar page shows the account-level one as a
banner. Also check the episode aired within the last **36 hours**: older airings are
deliberately outside the send window, so enabling the feature never mails a backlog.

### The calendar is empty on a fresh deploy
**Cause:** the schedule hadn't been pulled yet. **Fix:** it warms once on boot and
refreshes every 6 hours, on the `RUN_DB_SYNC` replica only. If it stays empty, confirm
that replica exists and check the log for a failed AniList refresh.

### Rows say "AniList #191832" instead of a title
**Cause:** an old `airing_schedule` row written before `007_airing_titles.sql`, on a
title the local catalogue doesn't know yet (the Fribb resync lags a new season by
weeks). **Fix:** it heals on the next refresh, which now asks AniList for the name in
the request it was already making. A refresh that comes back without a name never
erases one already stored.

## Playback

### Streams are blocked as "mixed content"
**Cause:** the backend emitted `http://` URLs because it didn't see it was behind HTTPS.
**Fix:** make your reverse proxy set `X-Forwarded-Proto: https` (and `X-Forwarded-Host`).
The image already starts uvicorn with `--proxy-headers --forwarded-allow-ips "*"` so it
trusts them; if you override the container command, keep those flags.

### "This content is blocked" / CSP errors in the console
**Cause:** the in-browser player must connect to rotating hoster CDNs, which the page's
`connect-src` CSP must allow. **Fix:** the client ships `connect-src 'self' https:` in
`security-headers.conf` for exactly this; tightening it blocks playback. (`script-src`
stays strict; only `connect-src` is widened.)

### CORS errors loading `/cache_proxy` or subtitles
**Cause:** a cross-subdomain request became CORS-enforced (e.g. a `<video crossorigin>`
when subtitle tracks are present) and the response lacked the header. **Fix:** ensure
`ALLOWED_ORIGINS` includes your client's exact HTTPS origin and the container actually
sees that value. Check the failing request's status: a 404 means the cached file moved
or its target was disabled, not a CORS bug.

### The proxy path does nothing / `/sign` returns 503
**Cause:** `CRIMSON_PROXY_BASE` isn't set on the backend (or wasn't injected into the
container), so the E2 path is disabled. **Fix:** set `CRIMSON_PROXY_BASE` (and make sure
it's in the compose `environment:` block), deploy the proxy with `NITRO_PROXY_SECRET`
equal to the backend's `PROXY_SECRET`, and recreate the backend.

### Proxy plays sometimes, fails on refresh
**Cause:** one edge host (e.g. Netlify) is unhealthy while another (Cloudflare) works,
and requests were landing on either. **Fix:** the backend health-checks edges every two
minutes and routes only to healthy ones, so make sure every host in `CRIMSON_PROXY_BASE`
is deployed and reachable, or list only the working one.

## The companion extension

### The page doesn't detect the extension
**Cause:** it isn't loaded or enabled, or its content script isn't injecting on your
hostname. **Fix:** confirm it's enabled at `chrome://extensions` and shows the current
version, and that your site's hostname matches the extension's allowed origins
(`crimsonhaven.to`, its subdomains, `localhost` and `127.0.0.1`). In the site console,
check `window.CrimsonExtension?.available`.

### Extension is detected but streams 403 after a few seconds
**Cause:** the header-injection rules were torn down mid-playback. **Fix:** the client
keeps media rules alive through playback and clears them on the *next* episode. If you've
modified the client engine lifecycle, don't dispose the engine when resolving
completes.

### Some hosts fail with "intercepted by a content blocker"
**Cause:** a co-installed blocker (AdGuard, uBlock) is substituting a stub for the media.
**Fix:** the fetches happen in the extension's service worker (no tab context), so a
per-site allowlist may not help. Pause the blocker or disable the specific rule.

## Lumi's chatbot

### No summon button appears, even though she's switched on
**Cause:** almost always the missing per-account grant. Access is deny-by-default and the
drawer renders nothing at all rather than showing a disabled button. **Fix:** grant that
member on **Admin › Users** (the bot icon next to the admin toggle), then reload. If it's
still absent, check `GET /chat/status`: `granted:false` is the grant, `enabled:false` is
the master switch on **Admin › Lumi**, and `configured:false` is a missing API key. She
is also hidden on the watch pages by design.

### Every message answers `503` "no oracle configured"
**Cause:** the container can't see a provider key. Compose and Swarm only inject variables
**explicitly listed** in a service's `environment:` block, so a key that's in your `.env`
alone never reaches the app. **Fix:** add `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` to that
block and recreate the container. **Admin › Lumi** shows *key present* once it lands.

### The key is "present" but every call fails with `400 API_KEY_INVALID`
**Cause:** a missing `$` in the compose file. `{GEMINI_API_KEY:-}` is passed through as
that literal string, which reads as present to the feature gate and then fails upstream.
**Fix:** write `${GEMINI_API_KEY:-}`, and recreate the container.

### She refuses with "you have exhausted this month's audience"
**Cause:** that member hit their monthly token budget, or an admin froze them with an
explicit budget of `0`. **Fix:** raise the haven-wide budget on **Admin › Lumi**, or set a
per-member override via `PATCH /admin/users/{id}`. Budgets reset at the start of each
calendar month. See [Lumi, the chatbot](/self-hosting/lumi/#the-brakes).

### Saving the settings is rejected, or Claude isn't selectable
**Cause:** switching her on with no key for the *selected* provider is refused up front
(better than a `503` for whoever opens the drawer first), and pairing a model with the
wrong vendor is refused too. If the tab warns that the `anthropic` package is missing,
this build was stripped of the optional SDK and only Gemini can answer. **Fix:** set the
matching key, pick a model from that provider's list, and rebuild the image if you want
the Claude path back.

## Still stuck?

- Re-read the relevant [Self-Hosting Guide](/self-hosting/backend/) page.
- Check `docker compose logs -f` on the backend and client.
- Confirm the [sanity checklist](/deployment/domains/#a-quick-sanity-checklist).
- See the [Glossary](/help/glossary/) if a term is unfamiliar.
