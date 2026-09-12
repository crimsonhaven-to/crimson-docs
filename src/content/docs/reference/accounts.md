---
title: Accounts & the login wall
description: How Crimson Haven's members-only login wall, the two sign-in methods, invites and the Discord bot work.
---

Crimson Haven is **members-only by default**. This page explains the wall, the two
ways to sign in, and how to invite people.

## The login wall

When `REQUIRE_LOGIN=true` (the default), every content endpoint requires a valid
session token. A small whitelist stays public: the auth endpoints, `/health`, the
Ko-fi webhook, and the signed stream proxies + `/player` (which `<iframe>`/`<video>`
load without headers, so they're protected by their HMAC signature instead). Validated
tokens are cached briefly so the wall adds no database hit on hot paths.

Set `REQUIRE_LOGIN=false` to open the whole API (e.g. a public, no-accounts demo).

## Two sign-in methods (they coexist)

An account carries **either** an Ed25519 public key **or** an email + password hash.

### Mnemonic (Ed25519)

No usernames, no passwords, no mail server. The account **is** a key derived from a
12-word BIP39 phrase that lives entirely on the user's device (like P-Stream). The
server stores only the public key and verifies signatures over one-time challenges —
the phrase never reaches the backend, so a database leak exposes no credential.

> **There is no recovery.** Lose the phrase, lose the account. Tell your members to
> write it down.

The client must derive keys exactly as the backend expects:

```text
mnemonic  : 12 BIP39 English words (128-bit entropy)
seed      : PBKDF2-HMAC-SHA512(mnemonic, "mnemonic"+passphrase, 2048, dklen=64)
privSeed  : seed[:32]
keypair   : Ed25519 from privSeed         (RFC 8032; == @noble/ed25519)
public_key: hex(publicKey)                (64 lowercase hex chars) → the account id
```

### Email + password

Familiar, and supports verification + reset — but needs SMTP configured. Passwords are
hashed with PBKDF2-HMAC-SHA256 (600k iterations). Verification and reset links are
emailed as single-use, hashed tokens.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/email/register` | Create an invite-gated, unverified account → sends verification. |
| `POST /auth/email/login` | Email + password → session (`403` until verified). |
| `POST /auth/email/verify` | Consume a verification token → verified + a session. |
| `POST /auth/email/resend` | Resend verification (always `200`, no account-exists oracle). |
| `POST /auth/email/forgot` / `…/reset` | Start / complete a password reset. |

## Invites (registration is always gated)

Both account types require a valid invite to register, so the site stays private.

- **Shared code** — `SIGNUP_INVITE_CODE` (comma-separated for several). Reusable.
  **Empty ⇒ registration closed** (`403` for everyone).
- **Single-use codes** — minted from the admin dashboard or the Discord bot; each
  registers exactly one account, then dies. Both kinds are accepted in the same signup
  field.

## Admins

Accounts whose email is in `ADMIN_EMAILS` are promoted to admin on startup (so admin
implies an email account). Admins get the dashboard: user management, invite minting,
forced metadata re-sync, and health/source/proxy stats. After the first seed, admins
can promote/demote others from the dashboard.

## The Lumi grant

If you've woken [Lumi's chatbot](/self-hosting/lumi/), talking to her is a
**separate, per-account permission** that starts denied for everybody, including
admins. Admins hand it out one member at a time on **Admin › Users** (the bot
icon beside the admin toggle; granted accounts wear a *Lumi* badge). There is no
environment variable that grants it in bulk, because it's a spending decision:
each grant, revocation and budget change is written to the security ledger below.

## The security ledger

Every denial at the gates is remembered. The backend keeps an append-only
security-event log fed by the auth endpoints, the rate limiter, and the admin
dashboard itself:

- **Failed & successful logins** (both sign-in methods), blocked signups, and —
  the classic symptom of strangers probing — **invalid invite codes**.
- **Verification and password-reset activity**, including requests for emails
  that don't exist (only admins can read the ledger, so recording that re-opens
  no account-existence oracle).
- **Every rate-limit trip** (someone hammering the auth endpoints is the
  strongest brute-force signal there is).
- **Admin actions** — account deletions, admin grants/revocations, forced
  logouts, invite minting, bridge-key changes, and every
  [Lumi](/self-hosting/lumi/) grant, revocation, budget change or settings edit —
  a paper trail of the keepers themselves.

Admins read it under **Admin › Security**: 24-hour threat tiles, a per-day
activity chart, the top offending IPs, the most-targeted identities, and the
filterable raw ledger underneath (served by `/admin/security/stats` and
`/admin/security/events`).

Two things are deliberately **not** logged, so signal beats noise: the
site-wide login wall (every bot crawling the internet knocks on it — the ledger
would drown in days), and the mnemonic login/register existence checks (they're
ordinary steps of the client's sign-in flow, not attacks).

Writes are fire-and-forget — a logging failure can never break a login. Events
store the client IP and the *attempted* identity: an email, or only the first
12 characters of a mnemonic public key — never passwords, tokens, or full keys.
Rows are pruned after `SECURITY_EVENTS_RETENTION_DAYS` (default 90 days), which
doubles as the privacy mechanism. The table is created automatically on the
next deploy; there is nothing to migrate or switch on.

Members see a **narrowed** view of the same ledger on their own account page
(below), filtered to their own `user_id` and to a whitelist of event types.

## Your account, in your own hands

The ledger and the session table have existed since the beginning, and for just as
long only an admin could read them. A member can now see and act on their own half,
from **Account › Security**. Nothing here needs configuration: the routes exist as
soon as you deploy.

| Endpoint | What it gives the account holder |
| --- | --- |
| `GET /account/sessions` | Where you are signed in, newest first, with the current session flagged. |
| `DELETE /account/sessions/{id}` | Sign out one device. |
| `DELETE /account/sessions` | Sign out everywhere except here. |
| `GET /account/security-events` | Your own recent activity, from the whitelist below. |
| `GET /account/export` | Every row this account owns, as one JSON download. |
| `DELETE /account` | Delete it yourself, confirmed and audited. |

`migrations/005_session_devices.sql` adds `user_agent`, `ip` and `last_seen_at` to
the `sessions` table, so "where you are signed in" can name a device instead of
saying "a session, created at some time". Sessions that predate the migration render
as an **unknown device** rather than being hidden.

### Four rules this surface is built on

**A session is never addressed by its token hash.** `token_hash` is the primary key
of the session table and it is the SHA-256 of a live bearer token, so publishing it
would hand an attacker the lookup key for every session. The public id is a *second*
one-way hash over it, derived inside the data layer rather than by a route handler,
so a handler cannot leak the real one by forwarding a row it did not inspect. It is
stable, so a client can revoke a session it listed a minute ago, and it cannot be
turned back into a `WHERE` clause: revocation matches in Python over the caller's own
rows.

**`last_seen_at` costs no extra round trip.** The login wall already avoids a
database hit per request with a short validity cache, and a naive "touch on every
request" would undo exactly that. The check itself does the stamping: one
`UPDATE ... WHERE token_hash = … AND expires_at > …` whose rowcount *is* the answer,
run only on a cache miss, exactly like the API-key path already did.

**The member's feed is a whitelist, not a filtered blacklist.** Every type below was
read and judged safe to show its owner; a type added to the ledger later stays
invisible until someone does the same for it. `admin_action` in particular never
appears, since it describes what an operator did and often to whom. The response
carries the whitelist and the retention window, so the client labels what it renders
instead of keeping a copy that drifts.

```text
login_success · login_failed · login_unverified · register_success
password_reset_requested · password_reset_success · password_reset_failed
email_verified · verify_failed · verify_resend_requested
session_revoked · account_delete_failed · account_deleted
```

`detail` and `identity` never travel with these rows: `detail` is an internal blob
that can carry operator context, and matching on `identity` would be worse than
useless. A failed login against an unknown address has **no** `user_id`, so showing
it to whoever owns that address would turn the endpoint into an account-enumeration
oracle for anyone who can register. The filter is on `user_id` alone.

**Deleting the account does not delete the trail.** `security_events.user_id`
deliberately carries no foreign key, so the ledger outlives the account it describes.
Favorites, progress, follows and sessions do cascade, which is also correct. Self
deletion is confirmed with a password (email accounts) or a signed challenge
(mnemonic accounts, using the same challenge-and-sign as login), rate limited at
`5/hour`, and writes its audit row *before* the delete.

:::caution[The rate limit has room for a typo]
Five per hour, not three. A limit so tight that two mistyped passwords lock the
account holder out of a deliberate action for an hour is a worse failure than the one
it prevents. The confirmation is the real gate.
:::

The export carries the account row (minus `password_hash` and `is_admin`),
preferences, watchlists, progress and follows. It is a copy of *your data*, not of
what the server knows about you as a principal.

## Crimson Wrapped

`GET /account/wrapped?year=&offset_minutes=` is a member's year of watching:
episodes and films, hours, distinct titles, active days, longest streak, busiest day,
top genres, first and last title of the year, and the split across the anime / show /
movie / manga / local surfaces. Members reach it from the account dropdown.

### Read the `approximate` flag before you believe a number

`watch_progress` looks like a history table and is not one. It is keyed
`(user_id, item_key)` and overwritten on a timer during playback, so `updated_at` is
the **last touch**, not when an episode was watched, and a rewatch overwrites rather
than appends.

So `migrations/006_watch_events.sql` adds an append-only `watch_events`, written from
the existing progress handler as a single `INSERT ... ON CONFLICT` inside the *same*
threadpool hop and connection as the progress upsert. A ping every 30 seconds writes
**one row per episode per day**, not 120 rows an hour.

Wrapped computes from `watch_events` for the span that table covers and from
`watch_progress` for the span before it, and sets `approximate: true` with
`events_since` whenever any part of the year came from the older, weaker source.

:::caution
The **first** Wrapped on your deployment will carry `approximate: true`, because the
table starts existing the day you deploy and most of that year predates it. That is
not a corner case; it is the normal first year.
:::

### The counting rules, since the failure mode here is a plausible wrong number

- **The viewer's own day.** `offset_minutes` is the caller's UTC offset, because
  "busiest day" and "longest streak" change meaning with where you are. The local day
  is derived from the event timestamp, not from the stored date, and the query window
  is padded a day either side, or a viewer east of UTC loses New Year's Eve.
- **Hours are the furthest point reached per title**, not a sum of daily figures. An
  episode watched across two days appears on both; summing would report a 24-minute
  episode as 40. Taking the maximum undercounts a rewatch and never overcounts, which
  is the right direction for a number shown to the person who did the watching.
- **Surfaces are counted separately, never summed into one headline.** Manga rows key
  per title, not per chapter, so a manga row is not comparable to an anime row.
- **Genres exclude local media and manga.** Local rows carry no AniList or TMDB id and
  so no genres, and AniList numbers manga in its own id space, so looking a manga id up
  in the anime catalogue would silently return a different title's genres.
- **Titles group per show, not per item**, so a long-running series appears once
  instead of once per episode.

`watch_events` rows are pruned at **three years** by the existing housekeeping sweep,
which is far enough back for Wrapped to look at two full past years while keeping the
one table designed to be read years later from growing forever. Years before 2023 are
not offered.

## Account data

## The Discord invite bot

An optional, owner-only bot (`python -m discord_bot`) lets **one** whitelisted operator
mint single-use invites with a chat command — handy for a community.

1. Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications),
   copy its **token**, and enable **Message Content Intent**.
2. Set `DISCORD_BOT_TOKEN` and `DISCORD_OWNER_ID` (your numeric Discord user id). Only
   that user may use it.
3. Run **exactly one** instance (a second login fights the first). In the bundled
   stacks it's the `discord-bot` service.

DM the bot (default prefix `!`):

| Command | Action |
| --- | --- |
| `!invite [n]` | Mint *n* one-time invites (1–20, default 1). |
| `!invites` | List outstanding tokens. |
| `!revoke <code>` | Delete an unused token. |
| `!ping` / `!help` | Liveness / usage. |

With `DISCORD_BOT_TOKEN` unset the process just logs *disabled* and idles.

## Account data

Favorites are show-level; watch progress is per-episode (auto-flips to *completed*
past 90%). Both live in their own PostgreSQL tables, untouched by mapping resyncs.
Members can export/import their lists from the Favorites menu, or pull everything
at once from `GET /account/export`.

Two more tables belong to the member and cascade away with the account:
`anime_subscriptions` (the titles they [follow](/self-hosting/airing-calendar/)) and
`watch_events` (the append-only history [Wrapped](#crimson-wrapped) reads).
