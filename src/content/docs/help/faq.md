---
title: Q&A — Lumi answers
description: Frequently asked questions about self-hosting Crimson Haven, answered plainly.
---

Curious mortal! Here are the questions that tend to surface. If yours isn't here, the
[Troubleshooting](/help/troubleshooting/) page covers things that go *wrong*.

## General

### Does the backend actually stream anything?
By default, almost nothing. It serves metadata, accounts and orchestration, plus any
**operator-owned** sources you enable (your own files, cache, or Jellyfin). All
third-party streaming is resolved in the visitor's browser by your private sources
engine. See [What is Crimson Haven?](/welcome/what-is-it/).

### Can I run it with just the backend and client?
Yes. You'll have full metadata, search, the catalogue, accounts, favorites and
progress. *Playback* needs a sources engine (yours), and benefits from the proxy and
extension. Start with the [Quick start](/getting-started/quick-start/).

### Is this legal?
The Crimson Haven software is plumbing — it hosts no content. What you make your private
[sources engine](/self-hosting/sources/) do, and whether you may access any given
content, is your responsibility under your local laws. The split exists precisely so the
public projects carry no scrapers.

### Where do the sources come from?
You provide them, in your **own private repository**, bundled into the client at build
time. The public stack ships none. This documentation tells you how to plug yours in,
not what to put in it.

## Setup

### What does it cost to run?
A small VPS (€5/month-ish) plus a free TMDB key is enough for a community, because video
bytes don't flow through your server. The edge proxy runs on free Netlify/Cloudflare
tiers. The only paid thing is whatever server + domain you choose.

### Do I need a domain to try it?
No — `localhost` is fine for testing ([Quick start](/getting-started/quick-start/)). You
need a domain + HTTPS only to put it on the public internet
([Domains, TLS & Cloudflare](/deployment/domains/)).

### The client build can't find "crimson-sources" — is that a problem?
No. The client has a built-in safeguard: if `vendor/crimson-sources` is absent it falls
back to a no-op stub and builds a sources-free site. If you *intended* to bundle sources
and they're missing, set the `CRIMSON_SOURCES_REPO` + `SUBMODULES_TOKEN` secrets — see
[Adding your own sources](/self-hosting/sources/#making-ci-bundle-a-private-sources-repo-env-driven).

### Nobody can register — every signup is rejected.
Registration is invite-gated. Set `SIGNUP_INVITE_CODE` (empty means *closed*), and have
users enter that code at signup. See [Accounts](/reference/accounts/).

### How do I become an admin?
Admin is granted to accounts whose email is in `ADMIN_EMAILS` — so you need an
email+password account (which needs SMTP). See
[First login & admin](/getting-started/first-login/).

## Architecture & features

### What's the difference between the proxy and the extension?
Both let the browser play gated streams. The **proxy** (E2) is a datacenter edge relay —
good for header-gated sources. The **extension** (E3) runs in the viewer's real browser
on their own IP — it handles everything the proxy can't (anti-bot fingerprints,
IP-bound tokens) and streams straight from the CDN. The extension is the best path; the
proxy covers visitors who don't install it. See [New System](/architecture/new-system/).

### Do my visitors *have* to install the extension?
No. It's a pure upgrade. Without it, header-gated sources still play via the proxy (if
configured), and the backend serves its own sources. The extension just makes the most
sources work, fastest.

### What are these "grants" the backend exposes?
Tiny login-gated endpoints (`/scrape-meta`, `/sign`, `/resolve`) that hand the client
exactly what it can't derive on its own — without ever shipping a server-held secret to
the browser. See [New System → grants](/architecture/new-system/#how-grants-fit-in).

### Can I scale to lots of users?
Yes — the backend is stateless behind a load balancer. The work is mostly the database
(pool it with PgBouncer, make it HA with Patroni) since bandwidth lives on the edge. See
[Swarm](/deployment/swarm/).

## Operations

### How do I update?
`git pull` each repo and re-deploy (`docker compose up -d --build`, or push a release for
CI). Pin to release tags for stability. Push submodule targets before the client that
bundles them — see [CI/CD](/deployment/cicd/).

### What must I back up?
PostgreSQL — it holds accounts and watch progress, which can't be re-derived. Everything
else is rebuildable. See [The database → Backups](/self-hosting/database/#backups-please-do-this).

### Can I host the docs myself too?
Yes — this site is an Astro + Starlight project that deploys to GitHub Pages. Point a
`docs.` subdomain at it ([Domains](/deployment/domains/#the-docs-site-this-very-site)).

### A visitor sees "content is blocked" or streams won't load.
Usually one of: a Content-Security-Policy `connect-src`, an HTTPS/mixed-content issue, or
a content blocker (AdGuard/uBlock) intercepting the stream. The
[Troubleshooting](/help/troubleshooting/) page walks through each.
