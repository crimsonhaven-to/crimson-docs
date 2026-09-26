---
title: "Q&A: Lumi answers"
description: Frequently asked questions about self-hosting Crimson Haven, answered plainly.
---

Ask away, mortal. If something is *broken* rather than unclear, see
[Troubleshooting](/help/troubleshooting/).

## General

### Does the backend actually stream anything?
Only the **operator-owned** sources you enable (your own files, the cache, or Jellyfin).
Otherwise it serves metadata, accounts and orchestration. All third-party streams are
resolved in the visitor's browser by your private sources engine. See
[What is Crimson Haven?](/welcome/what-is-it/).

### Can I run it with just the backend and client?
Yes: full metadata, search, the catalogue, accounts, favorites and progress. *Playback*
needs a sources engine (yours) and benefits from the proxy and extension. Start with the
[Quick start](/getting-started/quick-start/).

### Is this legal?
The Crimson Haven software is plumbing; it hosts no content. What your private
[sources engine](/self-hosting/sources/) does, and whether you may access any given
content, is your responsibility under your local laws. The split exists so the public
projects carry no scrapers.

### Where do the sources come from?
From your **own private repository**, bundled into the client at build time. The public
stack ships none. These docs explain how to plug yours in, not what to put in it.

## Setup

### What does it cost to run?
A small VPS (about €5/month) plus a free TMDB key is enough for a community, because
video bytes don't flow through your server. The edge proxy runs on free Netlify or
Cloudflare tiers. You pay only for the server and domain.

### Do I need a domain to try it?
No. `localhost` is fine for testing ([Quick start](/getting-started/quick-start/)). You
need a domain and HTTPS only to go public
([Domains, TLS & Cloudflare](/deployment/domains/)).

### The client build can't find "crimson-sources". Is that a problem?
No. If `vendor/crimson-sources` is absent, the client falls back to a no-op stub and
builds a sources-free site. If you *meant* to bundle sources, set the
`CRIMSON_SOURCES_REPO` CI/CD variable and allow the client project in the sources
repo's job token settings; see
[Adding your own sources](/self-hosting/sources/#making-ci-bundle-a-private-sources-repo-env-driven).

### Nobody can register: every signup is rejected.
Registration is invite-gated. Set `SIGNUP_INVITE_CODE` (empty means *closed*, apart from
single-use invites issued by the Discord bot) and have users enter that code at signup.
See [Accounts](/reference/accounts/).

### How do I become an admin?
Accounts whose email is in `ADMIN_EMAILS` are made admin, so you need an email+password
account (which needs SMTP). See [First login & admin](/getting-started/first-login/).

## Architecture & features

### What's the difference between the proxy and the extension?
Both let the browser play gated streams.

| | Proxy (E2) | Extension (E3) |
| --- | --- | --- |
| Runs on | A datacenter edge | The viewer's own browser and IP |
| Handles | Header-gated sources | Everything the proxy can't: anti-bot fingerprints, IP-bound tokens |
| Bytes come from | The edge relay | Straight from the CDN |

The extension is the best path; the proxy covers visitors who don't install it. See
[New System](/architecture/new-system/).

### Do my visitors *have* to install the extension?
No. Without it, header-gated sources still play via the proxy (if configured), and the
backend serves its own sources. The extension makes the most sources work, fastest.

### What are these "grants" the backend exposes?
Small login-gated endpoints (`/scrape-meta`, `/sign`, `/resolve`) that give the client
what it can't derive on its own, without ever sending a server-held secret to the
browser. See [New System → grants](/architecture/new-system/#how-grants-fit-in).

### Is the Lumi chatbot going to cost me money?
Only if you wake me, and only for the members you grant access one by one. I'm asleep on
a fresh install and need a provider key you supply. Every granted member has a monthly
token budget (2M by default), checked before each reply. **Admin › Lumi** shows the
estimated spend per member. Details: [Lumi, the chatbot](/self-hosting/lumi/).

### Does the chatbot send my library to a third party?
Only what a conversation needs: the member's message, that thread's history, their
display name, up to five recently watched titles, and whatever my tools returned for
that reply. No emails, passwords, mnemonics, tokens or IPs, and nothing about members
who aren't chatting. If that's still too much for your threat model, leave me asleep;
everything else works the same.

### Will my members get emails about new episodes?
Only if you switch it on. The [airing calendar](/self-hosting/airing-calendar/) and
per-title follows need no configuration. The email needs `SMTP_*` plus
`AIRING_NOTIFY_ENABLED=true`, and only reaches accounts with a **verified** email, so
mnemonic accounts are skipped (the UI tells them). Rehearse with
`AIRING_NOTIFY_DRY_RUN=true` first: a sent email is the one thing a redeploy cannot
take back.

### Why does Crimson Wrapped say "approximate"?
Because for that year it partly is. Wrapped reads an append-only `watch_events` table
that starts filling the day you deploy the version that adds it. For any span before
that, it falls back to the older progress rows, which record the *last touch*, not when
something was watched. The flag is in the payload so the client can say so. See
[Crimson Wrapped](/reference/accounts/#crimson-wrapped).

### Can a member delete their own account, or see where they're signed in?
Yes, from **Account › Security**, with nothing to configure: active sessions with
per-device sign-out, their own slice of the security ledger, a full JSON export of their
data, and irreversible self-deletion (confirmed by password or a signed challenge). The
audit trail deliberately outlives the account. See
[Your account, in your own hands](/reference/accounts/#your-account-in-your-own-hands).

### Can I scale to lots of users?
Yes. The backend is stateless behind a load balancer. Bandwidth lives on the edge, so the
work is mostly the database: pool it with PgBouncer and make it HA with Patroni. See
[Swarm](/deployment/swarm/).

## Operations

### How do I update?
`git pull` each repo and redeploy (`docker compose up -d --build`, or push a release for
CI). Pin to release tags for stability. Push submodule targets before the client that
bundles them; see [CI/CD](/deployment/cicd/).

### What must I back up?
PostgreSQL. It holds accounts and watch progress, which can't be re-derived. Everything
else is rebuildable. See [The database → Backups](/self-hosting/database/#backups-please-do-this).

### Can I host the docs myself too?
Yes. This site is an Astro + Starlight project deployed to GitLab Pages. Point a `docs.`
subdomain at it ([Domains](/deployment/domains/#the-docs-site-this-very-site)).

### A visitor sees "content is blocked" or streams won't load.
Usually one of: a Content-Security-Policy `connect-src`, an HTTPS/mixed-content issue,
or a content blocker (AdGuard/uBlock) intercepting the stream.
[Troubleshooting](/help/troubleshooting/) walks through each.
