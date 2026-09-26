---
title: First login & admin
description: Create your account, promote yourself to admin, and tour the Crimson Haven admin dashboard.
---

Your Haven is up and you have an account. This page makes you its **keeper** (an
admin) and walks through the dashboard.

## Accounts, briefly

There are two ways to sign in, and they coexist:

| Type | Needs | Recovery |
| --- | --- | --- |
| **Mnemonic (12-word phrase)** | Nothing: no email, no password, no mail server. The account *is* a key derived from the phrase on your device. Best for getting started. | None. **Lose the phrase, lose the account.** |
| **Email + password** | An SMTP mail server (see [Backend environment](/reference/backend-env/)). | Verification and password reset. |

Both are **invite-gated**: nobody can register without a valid invite code, so your
site stays private. See [Accounts & the login wall](/reference/accounts/) for the full
model.

## Becoming an admin

Admin powers (user management, minting invites, forcing metadata re-syncs, health
stats) go to accounts whose **email** is listed in the backend's `ADMIN_EMAILS`
setting. Because admin seeding is by email, the admin account must be an **email +
password** account.

1. Configure SMTP and register an email account; see
   [Backend environment → SMTP](/reference/backend-env/#smtp-verification--reset-email).
2. Add that email to your backend `.env`:
   ```ini
   ADMIN_EMAILS=you@example.com
   ```
3. Recreate the backend container. Promotion runs at startup and only applies to
   accounts that already exist:
   ```bash
   docker compose up -d
   ```
4. Log in with that account. The **Admin** entry appears on the site, and
   `GET /account/me` returns `"is_admin": true`.

:::note[No mail server yet?]
A **private, single-keeper** Haven runs fine on a mnemonic account; you just won't
have the admin dashboard. Browsing, favorites, progress and your own sources all work
without admin.
:::

## The admin dashboard

| Tab | What it does |
| --- | --- |
| **Users** | List users, promote or demote admins, manage accounts. |
| **Security** | The security ledger: failed logins, invalid invite codes, rate-limit trips and admin actions, with threat tiles, an activity chart and the top offending IPs (see [the security ledger](/reference/accounts/#the-security-ledger)). |
| **Lumi** | The optional [in-app chatbot](/self-hosting/lumi/): the master switch, which provider and model answers, the spend guards, and what she has cost so far. Asleep until you wake her, and each member still needs an individual grant on the Users tab. |
| **Invites** | Mint shared or **single-use** invite codes. |
| **Metadata** | Force a re-sync of the TMDB↔AniList mapping, or trigger a catalogue backfill. |
| **Health** | Runtime stats, database-pool usage, and **Source Health**, which only shows your *operator-owned* sources (Local, Cache, Jellyfin) because the backend itself scrapes nothing. |
| **Proxy** | If you configured the [CORS proxy](/self-hosting/proxy/), a live view of which edge hosts are healthy. |

## Inviting your first members

- **A shared code**: set `SIGNUP_INVITE_CODE` to one or more codes (comma-separated).
  Reusable; hand it to whoever you trust.
- **Single-use codes**: mint them from the admin dashboard, or run the optional
  [Discord invite bot](/reference/accounts/#the-discord-invite-bot) so a trusted
  operator can mint them with a chat command. Each works exactly once.

## Next steps

- Make playback real: [Adding your own sources](/self-hosting/sources/).
- Offload video bandwidth: [The CORS proxy](/self-hosting/proxy/) and
  [The companion extension](/self-hosting/extension/).
- Go to production: [Single host](/deployment/single-host/), then
  [Swarm](/deployment/swarm/).
