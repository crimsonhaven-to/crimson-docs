---
title: The Nightshade path (absolute privacy)
description: A privacy-hardened, disposable, fully anonymous way to raise Crimson Haven from the dark network — Tor-only administration, outbound-only tunnels, and nodes you can burn and rebuild in minutes.
---

So you don't just want a sanctuary, mortal — you want a sanctuary that leaves **no
footprints in the snow**. No name on the lease, no port to knock on, nothing on any
box that whispers your true name even if it's seized and pried open. Very well. This
is the deepest, darkest wing of the castle, and I built it for exactly that. ( ˘ ω ˘ )

Everything else in these Archives is the *comfortable* path. This one is the **ghost**
path. It's more moving parts and more discipline than the [single host](/deployment/single-host/)
or even the [Swarm cluster](/deployment/swarm/) — but nothing here touches how Crimson
Haven *works*. It's the same `crimson-client`, the same `crimson-backend`, the same
PostgreSQL. We just wrap them in shadow.

:::tip[Lumi says]
Everything below is just theoretical, little mortal. I have never done something such
as that, but I merely *thought* about it in the late nights. This system design is 
the result of those thoughts, nothing more~
:::

:::tip[Lumi says]
This is the **bulletproof, privacy-first, undetectable** approach — for those who wish
to stay anonymous at all costs. Pay in monero, rule through Tor, treat every node as a
candle you can snuff out and re-light in minutes, and keep **nothing** that points back
to you. If that's the sanctuary you need, I'll walk you through every ward and every
shadow. I don't judge, darling — I *bite*. ( ˘ ³˘)♡
:::

## The one principle

> **Assume every node will eventually be seized, scanned, or subpoenaed.** Nothing on a
> node should point back to a human, and any node must be replaceable within minutes.

Hold that thought the whole way down. Every strange-looking choice below — paying in
crypto, hiding SSH inside Tor, encrypting every disk, refusing to give a box a public
port — falls out of that one sentence. We don't defend a node. We make losing one *not
matter*.

## Who the shadows are hiding you from

| The thing that hunts you | The ward that stops it |
| --- | --- |
| Internet-wide port scanners (Shodan, Censys) | The app and data boxes expose **nothing** publicly. SSH lives inside a Tor hidden service. Only the edge shows `80/443`. |
| A snooping hoster watching your traffic | Every node-to-node link is WireGuard — encrypted and authenticated. Every admin session is Tor. No plaintext, no intent leaking. |
| A seized or disk-imaged box | LUKS2 full-disk encryption with remote unlock; secrets never baked into the image; no operator identity anywhere. |
| A provider's KYC / payment paper-trail | VPSes paid in **monero (XMR)**, prepaid; accounts made with anonymous mailboxes; no reused identifiers. |
| A registrar caving to pressure | Domains are *cattle, not pets*: DNS-as-code, one-command rotation, spare registrars pre-staged. |
| A poisoned deploy pipeline | Self-hosted Git + CI, pinned digests, signed images, deploys only over the tunnel, least-privilege keys per node. |

**The assumption underneath it all:** the hosting provider is *not* your friend. Treat
the hypervisor as hostile. That's why disk encryption, zero-knowledge-at-rest, and
disposability matter more here than on a box you trust.

## The shape of the coven — one gate, many rooms

The whole trick is a single public gate and a cluster of rooms that only ever dial
*out* to it. Three nodes:

- **The Gate (`edge`)** — a VPS that is the *only* thing on the public internet. It
  runs [Pangolin](https://github.com/fosrl/pangolin) (a self-hosted tunnelled-ingress
  control plane) with Traefik in front and a WireGuard server (Gerbil) behind. It shows
  `80`, `443`, and the WireGuard port — nothing else.
- **The Face (`app`)** — a VPS that runs **only** the stateless `crimson-client`. No
  database, no secrets, nothing worth seizing. **Zero public ports.**
- **The Vault (`home`)** — a residential or colocated box behind NAT that holds the
  stateful heart: `crimson-backend` + PostgreSQL. No port-forwarding, no public ports.

```
                              🌍 public internet
                    end users (HTTPS)        you, the operator
                          │                    (Tor Browser /
                          │                     ssh-over-Tor)
                          ▼                          ┆ (Tor only)
        ┌─────────────────────────────────────┐     ┆
        │  THE GATE · edge VPS                 │◀┄┄┄┄┘  onion: edge-ssh
        │  public: 80 · 443 · 51820/udp (WG)   │
        │  Traefik ⟵ Pangolin ⟵ Gerbil (WG srv)│
        │  sshd → Tor onion only               │
        └────────┬───────────────────┬─────────┘
      WireGuard  │                   │  WireGuard
   (host=stream) │                   │  (host=api)
                 ▼                   ▼
   ┌──────────────────────┐   ┌──────────────────────────┐
   │ THE FACE · app VPS    │   │ THE VAULT · home server   │
   │ no public ports       │   │ no public ports · NAT     │
   │ Newt ⟶ (dials out)    │   │ Newt ⟶ (dials out)        │
   │ crimson-client (static)│  │ crimson-backend (REST)    │
   │ sshd → onion only     │   │ PostgreSQL (LUKS volume)  │
   └──────────────────────┘   │ sshd → onion only         │
                              └──────────────────────────┘

   the Face and the Vault NEVER talk to each other.
   only the visitor's browser talks to both — each via the Gate.
```

### The single-gate law (this is the whole spell)

- **Only the Gate has inbound public ports.** Everything else dials *out*.
- The Face and the Vault each run **Newt** — Pangolin's tunnel client — which opens an
  **outbound** WireGuard tunnel *up to* the Gate. Because the connection is outbound,
  **neither of them needs a single inbound firewall opening** — not even for the tunnel.
- A visitor loads `https://stream.<domain>` → Traefik on the Gate → over WireGuard →
  Newt on the Face → the static `crimson-client`.
- Their browser then calls `https://api.<domain>` for accounts and progress → Traefik
  on the Gate → over WireGuard → Newt on the Vault → `crimson-backend` → PostgreSQL.
- The Face and the Vault **never speak to each other.** The client is static; the
  browser is the only thing that talks to both, each through the Gate.

This is the entire anti-traceability backbone: scan the Face's IP or the Vault's IP and
you get **nothing**. Their very existence is knowable only to whoever holds the
WireGuard keys on the Gate — which is you, and Tor, and no one else. ( ˘ ω ˘ )♡

## The three rooms, in detail

### The Gate (`edge`) — the one public face

A single, small, declarative public surface. It fronts *both* other nodes the same way
— one ingress, many origins.

| Layer | Choice | Notes |
| --- | --- | --- |
| Reverse proxy / TLS | **Traefik** (managed by Pangolin) | ACME via **DNS-01**, so there's no `:80` challenge footprint; wildcard certs per domain. |
| Tunnel server | **Pangolin + Gerbil** (WireGuard) | Terminates the Newt tunnels from the Face and the Vault. |
| Control plane | **Pangolin dashboard/API** | **Never public** — bound to localhost, reached only via a Tor onion or the WG admin subnet. |
| SSH | `sshd` bound to `127.0.0.1`, published as a **Tor v3 onion** | No public `22`, anywhere. |
| Firewall | `nftables`, default-deny inbound; allow `80/443` + `51820/udp` from the world; drop the rest | Egress limited to what it truly needs (ACME, Tor, mirrors over Tor). |
| Disk | **LUKS2** full-disk encryption | Remote unlock via dropbear-SSH-over-Tor at boot. |

### The Face (`app`) — the stateless client, freely burnable

A minimal Docker Compose stack. **No database, no user state, nothing to seize:**

```
app stack
├── newt        # outbound WireGuard tunnel to the Gate (the ONLY way in)
└── client      # crimson-client SPA (static, served by caddy/nginx)
```

- The `crimson-client` is a plain static build. It's told the public API base URL
  (`https://api.<domain>`) at build time, so the **browser** calls `crimson-backend`
  directly through the Gate — the client container itself never talks to the backend.
- **Fully stateless ⇒ maximally disposable.** The Face can be destroyed and rebuilt
  purely from the CI image with **no restore step**. Losing it loses nothing but uptime.
- **No public ports.** `nftables` drops all inbound; the WireGuard interface Newt
  creates is the only ingress. Egress is locked to almost nothing.

### The Vault (`home`) — where the only real data lives

Everything stateful lives here, and *only* here. A Docker Compose stack:

```
home stack
├── newt          # outbound WireGuard tunnel to the Gate (the ONLY way in)
├── backend       # crimson-backend — accounts + watch-progress + grants
├── postgres      # accounts, progress, preferences (on a LUKS volume)
├── (valkey)      # optional session / rate-limit cache
└── (other home services)
```

- `crimson-backend` keeps its usual, honest job: metadata, accounts, the login wall,
  watch-progress, and the tiny `/sign`, `/resolve`, `/scrape-meta` grants. **It still
  scrapes nothing** — exactly as the [big picture](/architecture/big-picture/) describes.
  Nothing here that could warrant a takedown.
- **PostgreSQL** sits on a LUKS-encrypted volume. Daily `age`-encrypted dumps ship to an
  XMR-paid object store (see [Data & backups](#data--backups) below).
- **CORS** allows the client origin (`https://stream.<domain>`) only, so the
  browser-to-API calls work and everything else is refused.
- **Behind residential NAT, no port-forwarding.** Newt dials out to the Gate; Pangolin
  publishes the backend as `api.<domain>`.
- This is the **one node you can't treat as cattle**. It's long-lived, so it earns a
  more conservative unlock policy (e.g. local TPM + PIN rather than remote unlock), the
  strictest monitoring, and the backups that everything else can skip.

## The two journeys, and the address plan

Two independent routes, both ending at the Gate; the Face and the Vault never touch.

```
(1) Load the sanctuary (static):
Browser ──TLS──▶ Traefik (edge:443, host=stream.<domain>)
                   ──▶ Gerbil/WireGuard ──▶ Newt (Face) ──▶ crimson-client  [static]

(2) Accounts / watch-progress (called by the browser, not by the Face):
Browser ──TLS──▶ Traefik (edge:443, host=api.<domain>)
                   ──▶ Gerbil/WireGuard ──▶ Newt (Vault) ──▶ crimson-backend ──▶ PostgreSQL
```

And the private plumbing behind it:

| Network | CIDR | Purpose |
| --- | --- | --- |
| WG tunnel net | `10.88.0.0/24` | Gerbil ↔ Newt clients. |
| `edge` (Gate) | `10.88.0.1` | Gerbil server. |
| `app` (Face) | `10.88.0.2` | Newt on the stateless client node. |
| `home` (Vault) | `10.88.0.3` | Newt on the stateful backend node. |
| Vault internal Docker | `172.30.0.0/24` | backend ↔ postgres ↔ valkey. |

When *you* administer a node, no path ever touches the clearnet:

```
You (Tor Browser / torsocks ssh)
   │  resolve <random>.onion
   ▼
Tor network ──▶ HiddenServicePort 22 → 127.0.0.1:22 on the target node
```

SSH keys are per-node, ed25519, and live only in your offline keystore.

## The wards of anonymity

The protection is layered — **procurement → identity → network → host → operations.**
Peel any one away and the others still hold. ( ^ . ^ )

### Procurement — how you buy without being seen

- **Payment:** monero (XMR), prepaid for the longest term the provider allows. No
  cards, no PayPal, no recurring auth tied to a name.
- **Providers:** pick hosters that accept XMR (directly or via a privacy-respecting
  reseller), need little-to-no KYC, and offer an API. Keep **≥2 pre-vetted providers**
  so a burn can land on a different provider and ASN.
- **No reuse pattern:** vary provider, region, and account per node, so seizing one box
  gives no map to the others.

### Identity — the names you wear are masks

- A separate anonymous mailbox per provider account, each made over Tor.
- Unique random usernames and passwords per account, stored **only** in the vault.
- No phone numbers. If SMS is forced, use a voucher path or walk away from that provider.

### Network — everything travels in the dark

- **Administration is Tor-only.** SSH, Git, CI, the Pangolin admin — all reached via v3
  onion services. There is no clearnet management plane to find.
- **The data plane is WireGuard-only**, always dialled *outbound* from the resource
  nodes. The Face and the Vault are invisible to internet scans.
- **DNS-01 ACME** with an API token scoped to a single zone, living only on the Gate,
  rotated when the domain rotates. The app/data nodes have no public DNS at all.
- **No third-party CDN, no Cloudflare** in front. That's the opposite of the [comfortable
  path](/deployment/domains/) — here we refuse to hand an extra KYC'd party our TLS. The
  Gate terminates TLS itself.
- **Egress hardening:** the Face has *no* general internet egress. OS updates come over
  Tor during maintenance windows, or get baked into a rebuilt image.

### Host — every box is a sealed crypt

- **LUKS2 full-disk encryption** on every node; keys never stored on the node.
- **No analytics, no telemetry, no crash reporters** in any container. `crimson-client`
  already ships with zero third-party SDKs — keep it that way.
- **Log minimization:** access logs off or truncated; no client-IP retention beyond what
  Traefik holds in memory; backend logs carry user IDs only — no IPs, no PII — rotated
  hard.
- **NTP over Tor / NTS**, UTC everywhere, neutral locale, generic codename hostnames
  that reveal nothing of your naming style.

### Operations — the discipline that keeps it standing

- All infrastructure-as-code and secrets live in a **self-hosted** Git (onion), never on
  a public forge tied to a name.
- Your workstation is a hardened, Tor-routed environment (a dedicated VM or a Tails-like
  setup). Out of scope here, but assumed.
- **Burn-on-suspicion is cheap and rehearsed**, so the rational answer to any anomaly is
  "destroy and rebuild" — never "investigate in place."

## Disposability — every node is a candle

A node is *cattle*. Its whole life is:

```
You ──▶ provision (XMR-funded account, API token)  ──▶  fresh IP / instance
    ──▶ ansible-playbook site.yml -l <new-node>
            └─ harden OS · LUKS · nftables · Tor onion · enrol Newt
    ──▶ register as a deploy target ──▶ CI deploys the stack over the tunnel
    ══▶ node live. no manual steps. minutes, not hours.
```

**What must survive a burn lives *outside* any single node:**

- The IaC repo (Ansible / Terraform) — in self-hosted Git, mirrored offline.
- The secrets vault (WG keys, SSH keys, DB creds, API tokens) — `age`/`sops`-encrypted,
  backed up offline.
- Database backups — `age`-encrypted dumps in XMR-paid object storage.
- Tor onion keys — **your call:** keep stable onion addresses across burns (store the
  keys), or mint fresh onions per rebuild for maximum unlinkability. Default: **fresh
  onions** for admin SSH; stable only if an outside party must keep an address.

Everything else rebuilds from code. A burn is `terraform destroy` (or just stop paying
and wipe) plus a re-run of the provisioning pipeline against a new instance.

## Infrastructure as code

The whole coven is one repository — nothing is a hand-tended snowflake.

```
crimson-nightshade/
├── terraform/            # optional: provider-API provisioning (XMR-funded)
├── ansible/
│   ├── inventory/        # logical hosts → ONION addresses (never clearnet IPs)
│   ├── roles/
│   │   ├── base_hardening/     # nftables, sysctl, auto-updates, no-PII, UTC
│   │   ├── luks_remote_unlock/
│   │   ├── tor_onion_ssh/      # publish sshd as an onion, kill public 22
│   │   ├── pangolin_edge/      # Traefik + Pangolin + Gerbil        (Gate only)
│   │   ├── newt_client/        # outbound tunnel enrolment      (Face + Vault)
│   │   ├── client_stack/       # compose: stateless crimson-client     (Face)
│   │   ├── backend_stack/      # compose: backend + postgres + valkey  (Vault)
│   │   └── backup_age/         # encrypted DB dumps → object store     (Vault)
│   └── site.yml
├── compose/{client,backend}/docker-compose.yml
├── secrets/              # sops/age-encrypted ONLY — plaintext never committed
└── pipelines/.woodpecker.yml
```

The rules that keep it honest:

- **Idempotent:** re-running `site.yml` converges any node to spec.
- **No plaintext secrets — ever.** `sops` with `age`; CI gets a scoped, short-lived
  decrypt key.
- **Inventory holds onion addresses, not IPs**, so even a leaked repo reveals nothing
  scannable.
- **Least privilege per node:** the Face's deploy key can *only* deploy the stateless
  client — it can't touch the Gate or the Vault. A separate, more tightly held
  credential governs the backend on the Vault.

Adding or rotating a node is four steps: add an inventory entry (codename + role +
onion), `terraform apply` (or a manual XMR order), `ansible-playbook site.yml -l
<codename>`, and — for the Face — let CI redeploy. Swapping providers is just a
different Terraform module. Nothing else in the design changes.

## Host hardening — the fine wards

### nftables on the resource nodes (Face *and* Vault)

Both share the "the tunnel is the only way in" stance. The only difference is egress:
the Face needs essentially none; the Vault additionally reaches its own PostgreSQL and
Valkey on the internal Docker net.

```nft
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif "lo" accept
    ct state established,related accept
    iif "wg0" accept          # the tunnel from the Gate is the ONLY ingress
    # no public ports. period.
  }
  chain output {
    type filter hook output priority 0; policy drop;
    oif "lo" accept
    ct state established,related accept
    ip daddr 172.30.0.0/24 accept   # internal docker (VAULT only)
    oif "wg0" accept                # responses over the tunnel
    # NO general internet egress. updates happen over Tor, in maintenance mode.
  }
}
```

### SSH hidden inside Tor (every node)

```
# /etc/tor/torrc (excerpt)
HiddenServiceDir /var/lib/tor/ssh/
HiddenServiceVersion 3
HiddenServicePort 22 127.0.0.1:22
# sshd binds 127.0.0.1 only; public 22 is firewalled shut
```

You connect with `torsocks ssh root@<addr>.onion`. Add **client authorization** (onion
auth keys) and the service becomes *invisible* — unconnectable, its very existence
hidden, without your key. Delicious. ( ˘ ³˘)

### Encrypted disk + remote unlock

- Root on **LUKS2**. At boot, an initramfs **dropbear** SSH server — reachable as a Tor
  onion — lets you type the passphrase remotely. The key never touches the disk; a
  powered-off, seized node is just noise.
- Disposable nodes may instead take a **one-time keyfile** delivered at provision time
  and held only in the vault, so rebuilds stay fully automatable.

## Data & backups

> All persistent data lives on the **Vault** (`home`). The Face is stateless and has
> nothing to back up — which is exactly the point.

| Concern | Approach |
| --- | --- |
| Where | The Vault only. |
| What's stored | Accounts (id, handle, argon2id hash *or* WebAuthn credential), watch progress, preferences. **No IPs, no emails required, no real names.** |
| At rest | PostgreSQL on a LUKS volume. |
| Backups | `pg_dump` → `age`-encrypt (recipient = an offline key) → upload to an XMR-paid, S3-compatible store. |
| Restore | Rebuilt Vault → `ansible` → pull the latest `age` dump → `pg_restore`. Tested as part of burn drills. |
| Retention | Short and rolling (e.g. 7 daily + 4 weekly) — minimize the blast radius of any single leaked backup. |

**Data-minimization rule:** the backend refuses to store any field not on that list.
Email is optional and only for recovery; default to passwordless (WebAuthn) so there's
nothing to phish and nothing to leak.

## The pipeline (deploy the client to the Face)

Same idea as the [normal CI/CD](/deployment/cicd/) page — but every part of it lives
behind Tor, and every byte of a deploy travels the tunnel, never the clearnet.

```
git push (over Tor) ──▶ Forgejo (onion) ──webhook──▶ Woodpecker
   ──▶ build crimson-client image (pinned base, digest)
   ──▶ push to a PRIVATE registry ──▶ cosign-sign
   ──▶ deploy over WG/onion ──▶ Face: docker compose pull && up -d  (client only)
   ──▶ healthcheck ──▶ back to CI
```

An illustrative `pipelines/.woodpecker.yml`:

```yaml
steps:
  test:
    image: node:lts
    commands: [ "npm ci", "npm run lint", "npm test" ]

  build:
    image: docker:dind
    commands:
      # API base URL baked in at build time; the BROWSER (not the Face) calls it.
      - docker build --build-arg VITE_API_BASE_URL=https://api.$DOMAIN \
          -t $REGISTRY/crimson-client:$CI_COMMIT_SHA .
      - docker push  $REGISTRY/crimson-client:$CI_COMMIT_SHA

  sign:
    image: cosign
    commands: [ "cosign sign --key $COSIGN_KEY $REGISTRY/crimson-client:$CI_COMMIT_SHA" ]

  deploy:
    image: deploy-agent          # has WG/onion access + a scoped Face deploy key
    commands:
      - cosign verify --key $COSIGN_PUB $REGISTRY/crimson-client:$CI_COMMIT_SHA
      - ssh app 'cd /srv/client && \
          IMAGE=$REGISTRY/crimson-client:$CI_COMMIT_SHA docker compose up -d --pull always client'
    when: { branch: main }
```

- **Pinned digests** for all base images; **cosign**-signed builds; deploy verifies the
  signature before rollout.
- **Scoped credentials:** the CI deploy key can only `docker compose` the *client* stack
  on the Face — not configure the host, not touch the Gate, and **never** reach the
  Vault.
- **Tunnel-only delivery.** Image pull and deploy go over WireGuard/onion.
- **No public forge, no public artifacts.** The whole pipeline is behind Tor; build logs
  carry no secrets.
- **Rollback is one command** to the previous SHA — and because the client is stateless,
  it's risk-free.

The **backend** deploys on a *separate track*: its own image, its own tighter deploy
credential, targeting the Vault over the tunnel, with a **gated migration step** that
runs only on explicit approval so live data is never touched by accident. A client
change never reaches data; a backend deploy never depends on the disposable node.

## The burn runbook

```
anomaly (scan hit · provider notice · integrity alert)
        │
        ├─ the Face (stateless)?
        │     remove its peer from Gerbil (sever instantly) ──▶ destroy / wipe
        │     ──▶ re-provision ──▶ ansible ──▶ CI redeploys the client.  NO data step.
        │
        ├─ the Gate?
        │     rotate domain DNS → a pre-staged standby edge ──▶ destroy old ──▶ rebuild
        │
        └─ the Vault (stateful)?
              sever peer + VERIFY a current age-encrypted backup exists FIRST
              ──▶ rebuild ──▶ ansible ──▶ CI deploy backend ──▶ restore DB from age dump
        │
        ▼
   update inventory: new onion, new WG key; old keys revoked ──▶ live again
```

- **The Face is the easy case** — stateless, so a burn is pure rebuild. No backup, no
  restore, no data risk.
- **The Vault is the careful case** — it holds the only copy of live data, so its burn
  path *always* verifies a current `age` backup **before** teardown and includes a
  restore on rebuild. This is exactly why the data sits on the long-lived Vault and not
  on a burnable VPS.
- **Severing is instant:** pull a node's WireGuard public key from Gerbil and its only
  ingress is cut immediately, before teardown even begins.

## Domain rotation

- Keep **multiple domains** across **multiple XMR-friendly registrars**, pre-registered
  and parked.
- **DNS-as-code:** a small playbook updates the active zone's `A/AAAA` (and the ACME
  DNS-01 TXT) to point at the current Gate. Keep TTLs low so it propagates fast.
- Rotate by standing up (or reusing) a Gate, issuing certs for the active domain via
  DNS-01, flipping DNS, and optionally announcing the new address out-of-band.
- Because the **Face and the Vault have no DNS at all**, rotating the public domain
  never touches them — it's purely a Gate concern. A lovely payoff of the single-gate
  design. ( ˘ ω ˘ )

## Secrets, kept where they belong

| Secret | Lives where | Rotated |
| --- | --- | --- |
| SSH keys (per node) | offline keystore + sops vault | per burn |
| WireGuard keys | sops vault, deployed by Ansible | per burn / per node add |
| Tor onion keys | sops vault (if persistent) or ephemeral | per policy (default ephemeral for SSH) |
| DB credentials | sops vault → injected as env at deploy | on rebuild |
| DNS API token | sops vault → Gate only | on domain rotation |
| Registry / CI deploy keys | CI secret store (scoped) | periodically |
| Backup `age` key | **offline only** — never on any node | rarely, with great care |
| cosign signing key | CI secret store; public key in the repo | periodically |

The rule: **no node ever holds a secret it doesn't currently need**, and **no secret
survives a burn unless it must** (the backup key, kept offline, is the one that must).

## Watching without being watched

- **Local-only metrics:** a light node-exporter/cAdvisor scraped by a Prometheus on the
  Gate over the WG net, its dashboard behind an onion. No monitoring SaaS — that would
  leak both your existence and your identity.
- **Health checks:** container healthchecks plus a synthetic "can the client reach the
  backend reach the DB" probe, surfaced to CI for deploy gating.
- **Alerting:** pushed to a channel *you* control over Tor (a self-hosted ntfy on an
  onion, or a Matrix account reached via Tor). No SMS, no email-to-phone gateways.
- **Deliberately never collected:** user IPs, user-agents tied to accounts, geolocation,
  any third-party analytics.

## Cold start — from nothing to live

1. **Identities & funds:** make anonymous mailboxes; acquire XMR.
2. **Self-hosted Git + CI:** order the first VPS with XMR; Ansible installs Forgejo +
   Woodpecker behind a Tor onion; push the `crimson-nightshade` repo.
3. **The Gate:** `ansible site.yml -l edge` → Pangolin + Traefik + Gerbil + onion-SSH +
   LUKS.
4. **Domain:** register at an XMR-friendly registrar; wire the DNS-01 token into the
   Gate; issue certs.
5. **The Vault:** install Newt; `ansible site.yml -l home` → `crimson-backend` +
   PostgreSQL + Valkey, LUKS, onion-SSH; publish as `api.<domain>`. Confirm the first
   `age` dump lands in object storage.
6. **The Face:** order a VPS with XMR; `ansible site.yml -l app` → Newt dials out, Docker
   + the client compose skeleton + the CI deploy key. Publish as `stream.<domain>`.
7. **The pipeline:** push client code → CI builds, signs, deploys `crimson-client` to the
   Face over the tunnel; the separate backend pipeline deploys to the Vault.
8. **Verify:** `https://stream.<domain>` serves the sanctuary and `https://api.<domain>`
   serves accounts; `nmap` against the Face's and the Vault's IPs shows **everything
   filtered/closed**; SSH answers only via onion.
9. **Backups:** confirm the Vault's `age` dump is present; run a restore drill.
10. **Burn drills:** destroy the Face and rebuild it from code (it should come back green
    with **no** data step); then rebuild the Vault and restore the DB. Only *then* is the
    coven real.

## The bargains you're striking

Every ward costs something. Here's the honest ledger, mortal:

| Decision | Why | The price |
| --- | --- | --- |
| Single Gate ingress (Pangolin) | One tiny declarative public surface; the other nodes are invisible | The Gate is a single point of failure → soften it with a pre-staged standby + fast domain rotation |
| Outbound-only tunnels (Newt) | The Face and the Vault need **zero** inbound ports | A few more moving parts than raw WireGuard |
| Tor for *all* administration | Removes the entire clearnet management plane | Higher admin latency |
| No CDN / no Cloudflare | No extra KYC'd party; you own the TLS | You absorb DDoS risk at the Gate (lean on provider protection + rate limits) |
| Disposable, code-defined nodes | Burning beats forensics | Demands disciplined IaC + backups — the whole point of this page |
| Ephemeral onions per rebuild | Maximum unlinkability | You must re-distribute admin addresses |
| Data on the Vault, client on a burnable Face | The only data-bearing box is the long-lived one you physically control; the public face is stateless and freely burnable | The Vault must be reliable and well-backed-up — it's the one node you can't treat as cattle |

## One-screen reference

| Node | State | Public ports | Tunnel | Runs | SSH | Disk | Disposable? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gate (`edge`) | stateless | `80`, `443`, `51820/udp` | Gerbil/WG **server** | Pangolin, Traefik | onion only | LUKS2 | yes (standby + DNS flip) |
| Face (`app`) | **stateless** | **none** | Newt → Gate (**outbound**) | `crimson-client` (static) | onion only | LUKS2 | **yes** — pure CI rebuild, no restore |
| Vault (`home`) | **stateful** | **none** | Newt → Gate (**outbound**) | `crimson-backend` + PostgreSQL | onion only | LUKS2 | no — rebuild + DB restore; the data node |

:::note[Still just Crimson Haven underneath]
Notice what *didn't* change: the client, the backend, the grants, the database — all the
same as everywhere else in these Archives. The Nightshade path is a way of **hosting**
the castle, not a different castle. If this is more shadow than you need, the
[single host](/deployment/single-host/) and [Swarm](/deployment/swarm/) paths are
waiting, warm and lit. ( ^ . ^ )
:::
