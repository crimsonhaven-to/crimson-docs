---
title: First login & admin
description: Create your account, promote yourself to admin, and tour the Crimson Haven admin dashboard.
---

Your Haven is up and you've made an account. Now let's make you its **keeper** —
an admin — and look around.

## Accounts, briefly

There are two ways to sign in, and they coexist:

- **Mnemonic (12-word phrase).** No email, no password, no mail server needed.
  Your account *is* a key derived from the phrase, entirely on your device. Best
  for getting started. **Lose the phrase, lose the account** — there is no reset.
- **Email + password.** Familiar, and supports verification + password reset — but
  it needs an SMTP mail server configured (see [Backend environment](/reference/backend-env/)).

Both are **invite-gated**: nobody can register without a valid invite code, so your
site stays private. See [Accounts & the login wall](/reference/accounts/) for the full model.

## Becoming an admin

Admin powers (user management, minting invites, forcing metadata re-syncs, health
stats) are granted to accounts whose **email** is listed in the backend's
`ADMIN_EMAILS` setting. Because admin seeding is by email, the admin account must
be an **email + password** account.

1. Configure SMTP and register an email account — see
   [Backend environment → SMTP](/reference/backend-env/#smtp-verification--reset-email).
2. Add that email to your backend `.env`:
   ```ini
   ADMIN_EMAILS=you@example.com
   ```
3. Recreate the backend container so it picks up the change:
   ```bash
   docker compose up -d
   ```
4. Log in with that account — you're now an admin. The **Admin** entry appears in
   the site, and `GET /account/me` returns `"is_admin": true`.

:::note[No mail server yet?]
You can still run a perfectly good **private, single-keeper** Haven on a mnemonic
account — you just won't have the admin dashboard. Everything else (browsing,
favorites, progress, your own sources) works without admin.
:::

## The admin dashboard

Once you're an admin, the dashboard gives you:

- **Users** — list, promote/demote admins, manage accounts.
- **Invites** — mint shared or **single-use** invite codes to let new members in.
- **Metadata** — force a re-sync of the TMDB↔AniList mapping, or trigger a
  catalogue backfill.
- **Health** — runtime stats, database-pool usage, and the **Source Health** view
  (which only shows your *operator-owned* sources — Local / Cache / Jellyfin — since
  the backend itself scrapes nothing).
- **Proxy** — if you've configured the [CORS proxy](/self-hosting/proxy/), a live
  view of which edge hosts are healthy.

## Inviting your first members

Two ways to let people in:

- **A shared code** — set `SIGNUP_INVITE_CODE` to one or more codes (comma-separated).
  Reusable; hand it to whoever you trust.
- **Single-use codes** — mint them from the admin dashboard, or run the optional
  [Discord invite bot](/reference/accounts/#the-discord-invite-bot) so one trusted
  operator can mint them with a chat command. Each works exactly once.

## Next steps

- Make playback real: [Adding your own sources](/self-hosting/sources/).
- Offload video bandwidth: [The CORS proxy](/self-hosting/proxy/) and
  [The companion extension](/self-hosting/extension/).
- Go production: [Single host](/deployment/single-host/) → [Swarm](/deployment/swarm/).
