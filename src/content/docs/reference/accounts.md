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
Members can export/import their lists from the Favorites menu.
