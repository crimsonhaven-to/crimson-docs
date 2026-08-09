---
title: Lumi, the chatbot
description: How Crimson Haven's optional Lumi chatbot works, from the three gates that guard it to the tools she can call, the provider and model choice, and every brake on what it costs.
---

Lumi isn't only the voice narrating these Archives. If you want her to be, she's
also a **chatbot** living in a drawer inside your haven: a member summons her
from any page, asks what they should watch tonight, and she answers from **your
actual catalogue**, with a button that drops them straight into the episode.

She is **optional**, **asleep by default**, and **deny-by-default** for every
account. A fresh install has no chatbot at all, and waking her for the haven
still doesn't wake her for anybody in particular.

:::caution[The one part of the haven that costs money per message]
Every other surface bills you in bandwidth and disk. This one calls a paid
third-party API, so a single runaway conversation is the only thing in Crimson
Haven that can turn into a bill. Every brake described on this page exists
because of that sentence.
:::

## Three gates

A message only reaches a provider once **all three** of these are open. They're
checked in this order, and each one answers differently so an operator can tell
a misconfiguration from a policy decision:

| Gate | Where it lives | Default | Refused with |
| --- | --- | --- | --- |
| **1. A session** | The site-wide [login wall](/reference/accounts/) | already enforced | `401` |
| **2. The master switch** | **Admin › Lumi**, stored in PostgreSQL | **off** | `403` *"Lumi is not currently awake."* |
| **3. The member's grant** | **Admin › Users**, per account | **not granted** | `403` *"You have not been granted an audience with Lumi."* |

A fourth condition isn't a gate so much as a fact of life: the selected provider
needs an API key in the backend's environment, or the endpoint answers `503` and
the admin dashboard names the variable that's missing.

There is deliberately **no environment variable that grants access in bulk**.
Handing a member the chatbot is a spending decision, so it belongs in the
dashboard next to the admin flag, where the
[security ledger](/reference/accounts/#the-security-ledger) records who granted
it and when.

Members without the grant don't see a disabled button or an error; they see
nothing at all. The drawer asks `GET /chat/status` once on mount (that route is
safe for any signed-in account and answers with flags rather than a `403`), and
renders nothing unless the answer is yes.

## What she can actually do

Five tools reach into the real catalogue. Not one of them implements catalogue
logic of its own: each is a thin call into the code that already serves the REST
API, so a recommendation Lumi gives is by construction the recommendation
`/recommendations` would give, and there's no second implementation to keep in
step.

| Tool | What it does |
| --- | --- |
| `recommend_titles` | Personalised suggestions drawn from this member's own saved titles and watch history. |
| `search_catalogue` | Finds a title by name across anime, shows or movies, and returns its real ids. |
| `open_title` | Turns an id into a **play button** in the drawer. |
| `watch_progress` | "Where was I?" Reports what they're part-way through, and what they've finished. |
| `manage_watchlist` | Saves or removes a title, honouring the same per-account quota as the UI. |

Her system prompt is strict about the boundary: search before asserting anything
factual, never invent an episode count or a release year, report an empty search
honestly instead of pretending the title exists, and decline anything about
*acquiring* media. She's a character, not a liar, and a confidently invented plot
summary is the worst thing she could do here, because the viewer will believe her.

`open_title` deliberately **doesn't navigate anything**. It resolves a title to a
client route and hands it back; the drawer renders that as a button the member
presses. The backend stays unaware of the client's router, which is the same
division of labour the rest of the haven uses.

:::tip[Lumi says]
I do not guess, mortal. If I name an episode for you, it is because I looked it
up in your own shelves a heartbeat earlier. And if your Archives simply do not
hold the thing you asked for, I will say so, then offer you something better.
An empress does not bluff. ( ˶ˆ ᗜ ˆ˶ )
:::

## The drawer

A floating summon button sits bottom-right on every page except the watch
routes, where the player already owns that corner. Opening it slides out a panel;
Escape dismisses it, and the reset icon starts a fresh thread.

Replies **stream**. The transport is NDJSON over `POST` rather than SSE, for the
same reason `/watch` uses it: `EventSource` can't carry an `Authorization` header
or a request body, so the client reuses the reader it already had. Each line is
one small JSON object (`start`, `delta`, `action`, `done`, `error`), text renders
as it arrives, and a play button appears the moment a tool resolves one.

Once a response body has begun, HTTP can no longer change its status code, so
anything that goes wrong mid-reply arrives as an `error` line already phrased in
her voice. A stuck drawer would be a worse failure than an honest apology.

Closing the drawer aborts a reply still in flight, so a dismissed panel never
keeps paying for a generation nobody will read.

## Choosing an oracle

Provider and model are **operator settings in the database**, not environment
variables, so switching either takes a dropdown and a Save rather than a
redeploy. Only the keys live in the environment.

| Provider | Model | Rough price (in / out per M tokens) | Notes |
| --- | --- | --- | --- |
| **Anthropic** | `claude-sonnet-5` | $3 / $15 | **The default.** Best balance of persona fidelity and tool accuracy. |
| | `claude-opus-5` | $5 / $25 | Strongest reasoning; noticeably pricier for little gain in chat. |
| | `claude-haiku-4-5` | $1 / $5 | Cheapest Claude, but prompt caching never engages at Lumi's prompt size. |
| **Google AI Studio** | `gemini-3.6-flash` | $1.50 / $7.50 | The Gemini default. |
| | `gemini-3.1-pro-preview` | $2 / $12 | Strongest Gemini reasoning. Preview, so behaviour may shift. |
| | `gemini-3.5-flash-lite` | $0.30 / $2.50 | The budget floor. Weaker at multi-step tool use. |

Both may be configured at once, and the dashboard then switches between them
freely. Choosing a model that belongs to the *other* vendor is rejected with a
clear message rather than silently falling back.

The Anthropic path goes through the official SDK; the Gemini path is one `POST`
to a documented REST endpoint via the HTTP client the backend already ships, so
no second vendor SDK was added. The `anthropic` package is an **optional**
import, exactly like `prometheus-client`: a stripped build without it still boots
and serves the whole API, the dashboard says so plainly, and only Gemini can
answer.

Lumi's stable prefix (her persona plus the tool schemas) is roughly 1.8k tokens,
which clears the prompt-caching minimum on Sonnet 5 and Opus 5, but not on Haiku
4.5. That's why her system prompt is a frozen constant with no timestamp in it:
anything volatile there would change the prefix bytes on every call and turn
every cache read into a cache write. Per-member context (their display name, a
few recent titles) rides along as its own small uncached block instead.

## The brakes

| Brake | Default | What it bounds |
| --- | --- | --- |
| **Monthly token budget** | 2,000,000 per member | Consumption per calendar month, checked **before** each reply. `0` disables the cap. |
| **History turns** | 12 | How many past exchanges are replayed. The main lever on what a long conversation costs. |
| **Max tool rounds** | 5 | Tool round-trips inside one reply, so a model that decides to keep searching can't keep billing. |
| **Message length** | 2,000 characters | Nobody pastes a novel into the input. |
| **Rate limit** | 20 messages/minute | Per member, on top of everything above. |

The budget check runs before a reply starts, never during, so it stops the
**next** message rather than cutting one in half. That's what actually bounds a
runaway loop. Cached reads count toward it: they cost a tenth as much, but
they're still consumption, and a budget that ignored them would drift from the
cost chart sitting beside it.

A **per-member override** is available on the admin API
(`PATCH /admin/users/{id}`) and is tri-state on purpose: leave it alone, set a
number, or set an explicit `0` to freeze one member without revoking their grant.
Clearing it back to the haven-wide default is its own flag.

### Watching the spend

**Admin › Lumi** shows month-to-date and 30-day cost, token totals with the
cached share broken out, how many members are granted, how many threads exist,
and a per-member spend list so an unusual bill has a name attached to it.

Those figures are **estimates**, computed from published per-million rates at
call time rather than read from a vendor's billing API. They track real spend
closely, but won't match an invoice to the cent.

Every provider call writes one row to the usage ledger, so a single member
message with two tool round-trips writes three rows.

## What's stored, and for how long

The schema ships as `migrations/002_lumi_chat.sql` and applies itself on deploy.
There's nothing to switch on at the database level.

| Table | Holds | Retention |
| --- | --- | --- |
| `chat_settings` | The single operator settings row: switch, provider, model, budgets. | kept |
| `chat_conversations` | One row per thread. | pruned **30 days** after its last message |
| `chat_messages` | Member messages, her rendered replies, and any action cards. | with their conversation (`ON DELETE CASCADE`) |
| `chat_usage` | One row per provider call, with token counts and an estimated cost. | pruned after **180 days** |

Tool traffic is **not** persisted. Tool results are regenerated from live data on
replay anyway, and keeping them would feed stale recommendations back into the
model. A sweep runs every 12 hours, so the tables stay small without manual care.

Two smaller details worth knowing: a conversation id belonging to another account
resolves to a **new** thread rather than an error, so a stale id in a browser tab
can't be used to probe for someone else's conversation; and deleting an account
takes its threads, messages and ledger rows with it.

## What leaves your server

Being blunt about this, because it's the one place where the haven's usual
promise (nothing leaves the box) doesn't hold:

- **What is sent** to the selected provider: the member's message, the replayed
  history of that thread, their display name, up to five recently watched titles,
  and whatever the tools returned for that reply.
- **What is never sent**: emails, passwords, mnemonics, session tokens, IP
  addresses, or anything at all about members who aren't chatting.
- **What never touches the database**: the API keys themselves. They stay in the
  environment on purpose, so a dump of your accounts database can never carry
  billable credentials. The dashboard is told only whether each key is *present*,
  never its value.

:::caution[On the Nightshade path?]
[Absolute privacy](/deployment/absolute-privacy/) rests on the assumption that
your nodes talk to as little of the outside world as possible. A chatbot is an
outbound, authenticated, billed call to a large commercial API. If that's the
haven you're running, leave her asleep. She won't take it personally.
:::

## Waking her

1. **Put a key in the backend environment.** `ANTHROPIC_API_KEY` (recommended) or
   `GEMINI_API_KEY`. Under Compose or Swarm, remember to also list it in the
   service's `environment:` block, or the container never sees it.
2. **Recreate the backend container** so it picks the key up, then open
   **Admin › Lumi**. It should read *key present*.
3. **Pick a provider and model**, set a monthly budget you're comfortable with,
   and tick **Lumi is awake**. Saving with no key for the selected provider is
   rejected up front, rather than accepted and then failing for whichever member
   opens the drawer first.
4. **Grant individual members** on **Admin › Users**, with the bot icon beside
   the admin toggle. A *Lumi* badge appears on the accounts that have it.

## Configuration

Only the keys are environment variables. Everything else is operator state in the
database, changeable from the dashboard without a redeploy.

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Claude. The recommended provider. |
| `GEMINI_API_KEY` | unset | Google AI Studio. `GOOGLE_API_KEY` is accepted as an alias. |

:::caution[Mind the `$` in your Compose file]
Writing `{GEMINI_API_KEY:-}` instead of `${GEMINI_API_KEY:-}` passes that literal
string through as the key. It reads as *present* to the feature gate, then fails
every single call with a `400 API_KEY_INVALID`.
:::

Managed from **Admin › Lumi** instead: the master switch, provider, model, the
haven-wide monthly token budget, history turns and max tool rounds. Managed from
**Admin › Users**: the per-account grant.

See [Backend environment](/reference/backend-env/#lumi-the-chatbot).

## The endpoints

| Route | Purpose |
| --- | --- |
| `GET /chat/status` | Whether this viewer may chat. Any signed-in account may call it; answers flags, never a `403`. |
| `POST /chat` | Send one message, stream the reply as NDJSON. |
| `GET /chat/conversations` | This member's threads, newest first. |
| `GET /chat/conversations/{id}` | One thread's messages and action cards. |
| `DELETE /chat/conversations/{id}` | Delete a thread of their own. |
| `GET /admin/chat/settings` | Admin: settings, the model catalogue, and key presence. |
| `PATCH /admin/chat/settings` | Admin: change the switch, provider, model or budgets. |
| `GET /admin/chat/usage` | Admin: token and estimated-cost totals, plus the biggest spenders. |

## Recap

- Lumi's chatbot is **optional and triple-gated**: a session, a haven-wide switch
  that starts off, and a per-account grant that starts denied. Mounting the
  routes exposes nothing.
- Her five tools are **thin wrappers over engines that already exist**, so she
  can't drift from what the rest of the backend believes, and she's told to admit
  an empty result rather than invent one.
- **Provider, model and budgets are database-backed** and switch from the
  dashboard. Only the API keys are environment variables, so a database dump
  never carries billable credentials.
- **Spend is bounded** by a per-member monthly token budget, a history cap, a
  tool-round ceiling and a rate limit, and every call lands in a ledger the
  dashboard totals for you.
- Threads are pruned after 30 days, ledger rows after 180, automatically.
