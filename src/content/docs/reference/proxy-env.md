---
title: Proxy & edge secrets
description: Every environment variable the crimson-proxy edge relay reads, including the signing secret and the edge-held Jellyfin token.
---

The proxy reads its configuration from `NITRO_*` environment variables, set on the
**edge host** (Netlify / Cloudflare), never in any client bundle. See
[The CORS proxy](/self-hosting/proxy/) for deployment.

## Core

| Variable | Default | Description |
| --- | --- | --- |
| `NITRO_PROXY_SECRET` | – (open mode) | The HMAC secret. **Must equal the backend's `PROXY_SECRET`.** When unset, the proxy runs in *open mode* (no signature required) — local dev only, never production. |
| `NITRO_DEFAULT_UA` | a browser UA | Fallback `User-Agent` when a signed link doesn't specify one. |

## The request shape (reference)

```
GET /?u=<upstream url>&r=<referer>&o=<origin>&ua=<user-agent>&s=<signature>
```

`GET /` with no `u` is a health check. The signature is
`hex(HMAC-SHA256(secret, "<url>\n<referer>\n<origin>\n<user-agent>"))[:32]` — kept
byte-for-byte identical to the backend's `/sign` grant. Only `u` and `s` are required.

## Edge-held Jellyfin token (optional)

If you deliver Jellyfin via the edge (`JELLYFIN_EDGE_INJECT=on` on the backend), the
proxy logs into your Jellyfin server itself and injects the token on each upstream
fetch — stripping it from playlists so it's never browser-visible.

| Variable | Description |
| --- | --- |
| `NITRO_JELLYFIN_URL` | Base URL of your Jellyfin server (also the host the edge injects for). Must be internet-reachable; the SSRF guard rejects private/LAN IPs, so use a public hostname. |
| `NITRO_JELLYFIN_USERNAME` / `NITRO_JELLYFIN_PASSWORD` | Credentials the edge authenticates with (token cached, re-auth on 401). |
| `NITRO_JELLYFIN_TOKEN` | Optional pre-minted token, skipping username/password. |

Set these on **both** edges if you run two. Unset ⇒ the feature self-disables and
Jellyfin stays fully on the backend.

## Build presets

The proxy is a Nitro app; build it for your target edge:

| Command | Target |
| --- | --- |
| `pnpm build:cloudflare` | Cloudflare Workers |
| `pnpm build:netlify` | Netlify Edge |
| `pnpm build:node` | A plain Node server (self-host the relay) |

## Safety properties (worth knowing)

- **Signed-only** in production: forged/unsigned links get `401`, so it's never an
  open relay.
- **SSRF guard**: refuses private/loopback hosts and non-HTTP(S) schemes.
- **HLS-aware**: rewrites playlist sub-resources, re-signing them with the same secret.
- **Header-only sources only** for plain relaying: a source whose token is bound to the
  resolving machine's IP/ASN can't be served from a datacenter edge — those route to
  the [extension](/self-hosting/extension/) (E3) or the backend instead.

:::tip[Lumi says]
Run the proxy on **both** Netlify and Cloudflare and list both in the backend's
`CRIMSON_PROXY_BASE`. One signed link is valid on either, so you get free
load-balancing and automatic failover.
:::
