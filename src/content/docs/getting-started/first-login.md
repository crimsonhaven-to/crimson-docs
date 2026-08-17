---
title: First login & admin
description: Create your account, promote yourself to admin, and tour the Crimson Haven admin dashboard.
---

Your Haven is up and you've made an account. Now let's make you its **keeper**, an
admin, and look around.

## Accounts, briefly

There are two ways to sign in, and they coexist:

- **Mnemonic (12-word phrase).** No email, no password, no mail server needed.
  Your account *is* a key derived from the phrase, entirely on your device. Best
  for getting started. **Lose the phrase, lose the account**, as there is no reset.
- **Email + password.** Familiar, and supports verification + password reset, but
  it needs an SMTP mail server configured (see [Backend environment](/reference/backend-env/)).

Both are **invite-gated**: nobody can register without a valid invite code, so your
site stays private. See [Accounts & the login wall](/reference/accounts/) for the full model.

## Becoming an admin

Admin powers (user management, minting invites, forcing metadata re-syncs, health
stats) are granted to accounts whose **email** is listed in the backend's
`ADMIN_EMAILS` setting. Because admin seeding is by email, the admin account must
be an **email + password** account.

1. Configure SMTP and register an email account. See
   [Backend environment → SMTP](/reference/backend-env/#smtp-verification--reset-email).
2. Add that email to your backend `.env`:
   ```ini
   ADMIN_EMAILS=you@example.com
   ```
3. Recreate the backend container so it picks up the change:
   ```bash
   docker compose up -d
   ```
4. Log in with that account, and you're now an admin. The **Admin** entry appears in
   the site, and `GET /account/me` returns `"is_admin": true`.

:::note[No mail server yet?]
You can still run a perfectly good **private, single-keeper** Haven on a mnemonic
account. You just won't have the admin dashboard. Everything else (browsing,
favorites, progress, your own sources) works without admin.
:::

## The admin dashboard

Once you're an admin, the dashboard gives you a row of tabs:

- **Overview**: the at-a-glance summary of everything below.
- **Health**: the **Source Health** probe, which only shows your *operator-owned*
  sources (Local / Cache / Jellyfin), since the backend itself scrapes nothing.
- **Metrics**: request, latency and job charts drawn from the backend's own
  Prometheus data.
- **Security**: the gatekeeper's ledger of failed logins, invalid invite codes,
  rate-limit trips and admin actions, with threat tiles, an activity chart and
  the top offending IPs (see [the security ledger](/reference/accounts/#the-security-ledger)).
- **Users**: list, promote/demote admins, manage accounts, and grant Lumi access.
- **Lumi**: the optional [in-app chatbot](/self-hosting/lumi/). The master
  switch, which provider and model answers, the spend guards, and what she has
  cost so far. Asleep until you wake her, and every member still needs an
  individual grant on the Users tab.
- **Invites**: mint shared or **single-use** invite codes to let new members in.
- **Sources**: enable and configure the
  [operator-owned sources](/reference/operator-sources/).
- **Cache**: the server-side video cache and its download queue.
- **Downloads**: the optional aria2-backed background downloader.
- **Bridge Keys**: API keys for the companion surfaces that talk to the backend.
- **System**: runtime flags and capabilities, database-pool usage, the live CORS
  proxy view (which edge hosts are healthy), and the controls to force a
  TMDB↔AniList mapping re-sync or a non-anime catalogue backfill.

## Inviting your first members

Two ways to let people in:

- **A shared code:** set `SIGNUP_INVITE_CODE` to one or more codes (comma-separated).
  Reusable; hand it to whoever you trust.
- **Single-use codes:** mint them from the admin dashboard, or run the optional
  [Discord invite bot](/reference/accounts/#the-discord-invite-bot) so one trusted
  operator can mint them with a chat command. Each works exactly once.

## Next steps

- Make playback real: [Adding your own sources](/self-hosting/sources/).
- Offload video bandwidth: [The CORS proxy](/self-hosting/proxy/) and
  [The companion extension](/self-hosting/extension/).
- Go production: [Single host](/deployment/single-host/) → [Swarm](/deployment/swarm/).
