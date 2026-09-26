---
title: Proxy & edge secrets
description: Environment variables for the crimson-proxy edge relay, including the signing secret and the edge-held Jellyfin token.
---

The proxy reads `NITRO_*` environment variables, set on the **edge host** (Netlify or
Cloudflare) and never in a client bundle. See [The CORS proxy](/self-hosting/proxy/)
for deployment.

## Core

| Variable | Default | Description |
| --- | --- | --- |
| `NITRO_PROXY_SECRET` | unset (open mode) | The HMAC secret. **Must equal the backend's `PROXY_SECRET`.** Unset runs the proxy in *open mode* (no signature required): local dev only, never production. |
| `NITRO_DEFAULT_USER_AGENT` | a desktop Chrome UA | Fallback `User-Agent` when a signed link does not pin one. |

## The request shape (reference)

```
GET /?u=<upstream url>&r=<referer>&o=<origin>&ua=<user-agent>&s=<signature>
```

`GET /` with no `u` is a health check. The signature is
`hex(HMAC-SHA256(secret, "<url>\n<referer>\n<origin>\n<user-agent>"))[:32]`, byte for
byte the same as the backend's `/sign` grant. Only `u` and `s` are required.

## Edge-held Jellyfin token (optional)

With `JELLYFIN_EDGE_INJECT=true` on the backend, the proxy logs into your Jellyfin
server itself and injects the token on each upstream fetch. It strips the token from
playlists, so the browser never sees it.

| Variable | Description |
| --- | --- |
| `NITRO_JELLYFIN_URL` | Base URL of your Jellyfin server, and the host the edge injects the token for. Must be reachable from the internet: the SSRF guard rejects private and LAN IPs, so use a public hostname. |
| `NITRO_JELLYFIN_USERNAME` / `NITRO_JELLYFIN_PASSWORD` | Credentials the edge logs in with. The token is cached and renewed once on a `401`. |
| `NITRO_JELLYFIN_TOKEN` | Optional pre-minted token; skips the username and password login. |

Set these on **both** edges if you run two. With `NITRO_JELLYFIN_URL` unset the feature
is off and Jellyfin stays on the backend.

## Build presets

The proxy is a Nitro app. Build it for your target:

| Command | Target |
| --- | --- |
| `pnpm build:cloudflare` | Cloudflare Workers |
| `pnpm build:netlify` | Netlify Edge |
| `pnpm build:node` | A plain Node server (self-host the relay) |

## Safety properties

- **Signed only** in production: forged or unsigned links get `401`, so it is never an
  open relay.
- **SSRF guard**: refuses private and loopback hosts and non-HTTP(S) schemes.
- **HLS aware**: rewrites playlist sub-resources and re-signs them with the same secret.
- **Header-only sources** for plain relaying: a source whose token is bound to the
  resolving machine's IP or ASN cannot be served from a datacenter edge, so it goes
  through the [extension](/self-hosting/extension/) (E3) or the backend instead.

:::tip[Lumi says]
Run the proxy on **both** Netlify and Cloudflare and list both in the backend's
`CRIMSON_PROXY_BASE`. One signed link is valid on either, which gives you load
balancing and failover.
:::
