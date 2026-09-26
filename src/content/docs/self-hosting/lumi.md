---
title: Lumi, the chatbot
description: "The optional Lumi chatbot: the three gates that guard it, the tools it can call, provider and model choice, and the limits on what it costs."
---

Lumi is also an optional **chatbot** in a drawer on the site. A member opens it from
any page, asks what to watch, and gets answers from **your catalogue**, with a button
that opens the episode.

It is **off by default** and **denied by default** for every account. Turning it on for
the site does not give anyone access.

:::caution[The one feature that costs money per message]
Every other surface costs bandwidth and disk. This one calls a paid third-party API,
so a runaway conversation turns into a bill. The limits on this page exist for that
reason.
:::

## Three gates

A message reaches a provider only when **all three** are open. They are checked in
this order, and each answers differently so you can tell a misconfiguration from a
policy decision:

| Gate | Where it lives | Default | Refused with |
| --- | --- | --- | --- |
| **1. A session** | The site-wide [login wall](/reference/accounts/) | already enforced | `401` |
| **2. The master switch** | **Admin › Lumi**, stored in PostgreSQL | **off** | `403` *"Lumi is not currently awake."* |
| **3. The member's grant** | **Admin › Users**, per account | **not granted** | `403` *"You have not been granted an audience with Lumi."* |

The selected provider also needs an API key in the backend environment. Without one
the endpoint answers `503`, and the admin dashboard names the missing variable.

There is deliberately **no environment variable that grants access in bulk**. Granting
a member the chatbot is a spending decision, so it lives in the dashboard next to the
admin flag, where the [security ledger](/reference/accounts/#the-security-ledger)
records who granted it and when.

Members without the grant see nothing: no disabled button, no error. The drawer calls
`GET /chat/status` once on mount (any signed-in account may call it; it answers with
flags, never a `403`) and renders only if the answer is yes.

## What she can do

Five tools reach into the catalogue. None has catalogue logic of its own: each calls
the code that already serves the REST API, so a recommendation from Lumi is the one
`/recommendations` would give, and there is no second implementation to keep in step.

| Tool | What it does |
| --- | --- |
| `recommend_titles` | Personalised suggestions drawn from this member's own saved titles and watch history. |
| `search_catalogue` | Finds a title by name across anime, shows or movies, and returns its real ids. |
| `open_title` | Turns an id into a **play button** in the drawer. |
| `watch_progress` | "Where was I?" Reports what the member is part-way through and what they have finished. |
| `manage_watchlist` | Saves or removes a title, honouring the same per-account quota as the UI. |

The system prompt sets strict rules: search before stating any fact, never invent an
episode count or release year, report an empty search instead of pretending the title
exists, and decline anything about *acquiring* media. A confidently invented plot
summary is the worst failure here, because the viewer will believe it.

`open_title` deliberately **does not navigate**. It resolves a title to a client route
and returns it; the drawer renders that as a button the member presses. The backend
stays unaware of the client's router, as everywhere else.

:::tip[Lumi says]
I do not guess, mortal. If I name an episode for you, it is because I looked it
up in your own shelves a heartbeat earlier. And if your Archives simply do not
hold the thing you asked for, I will say so, then offer you something better.
An empress does not bluff. ( ˶ˆ ᗜ ˆ˶ )
:::

## The drawer

A floating button sits bottom-right on every page except the watch routes, where the
player uses that corner. It opens a side panel; Escape closes it, and the reset icon
starts a new thread.

Replies **stream** as NDJSON over `POST` rather than SSE, for the same reason `/watch`
uses it: `EventSource` cannot send an `Authorization` header or a request body. Each
line is one JSON object (`start`, `delta`, `action`, `done`, `error`). Text renders as
it arrives, and a play button appears as soon as a tool resolves one.

Once the response body has started, HTTP cannot change the status code, so an error
mid-reply arrives as an `error` line, already phrased in her voice, instead of leaving
the drawer stuck.

Closing the drawer aborts a reply in flight, so nobody pays for a generation no one
will read.

## Choosing an oracle

Provider and model are **operator settings in the database**, so switching either
needs a dropdown and Save, not a redeploy. Only the keys live in the environment.

| Provider | Model | Rough price (in / out per M tokens) | Notes |
| --- | --- | --- | --- |
| **Anthropic** | `claude-sonnet-5` | $3 / $15 | **The default.** Best balance of persona fidelity and tool accuracy. |
| | `claude-opus-5` | $5 / $25 | Strongest reasoning; noticeably pricier for little gain in chat. |
| | `claude-haiku-4-5` | $1 / $5 | Cheapest Claude, but prompt caching never engages at Lumi's prompt size. |
| **Google AI Studio** | `gemini-3.6-flash` | $1.50 / $7.50 | The Gemini default. |
| | `gemini-3.1-pro-preview` | $2 / $12 | Strongest Gemini reasoning. Preview, so behaviour may shift. |
| | `gemini-3.5-flash-lite` | $0.30 / $2.50 | The budget floor. Weaker at multi-step tool use. |

Both keys may be set at once; the dashboard then switches between providers freely.
Choosing a model from the *other* vendor is rejected with a clear message, never
silently swapped.

Anthropic calls go through the official SDK. Gemini is one `POST` to its REST endpoint
through the backend's existing HTTP client, so there is no second vendor SDK. The
`anthropic` package is an **optional** import: a build without it still boots and
serves the whole API, the dashboard says so, and only Gemini can answer.

Lumi's stable prefix (persona plus tool schemas) is roughly 1.8k tokens, which clears
the prompt-caching minimum on Sonnet 5 and Opus 5 but not on Haiku 4.5. The system
prompt is therefore a frozen constant with no timestamp: anything volatile would change
the prefix on every call and turn every cache read into a cache write. Per-member
context (display name, a few recent titles) goes in its own small uncached block.

## The brakes

| Brake | Default | What it bounds |
| --- | --- | --- |
| **Monthly token budget** | 2,000,000 per member | Consumption per calendar month, checked **before** each reply. `0` disables the cap. |
| **History turns** | 12 | How many past exchanges are replayed. The main lever on what a long conversation costs. |
| **Max tool rounds** | 5 | Tool round-trips inside one reply, so a model that decides to keep searching can't keep billing. |
| **Message length** | 2,000 characters | Size of a single member message. |
| **Rate limit** | 20 messages/minute | Per member, on top of everything above. |

The budget check runs before a reply starts, never during, so it stops the **next**
message rather than cutting one in half. Cached reads count toward it: they cost a
tenth as much but are still consumption, and a budget that ignored them would drift
from the cost chart beside it.

A **per-member override** is available on the admin API (`PATCH /admin/users/{id}`).
It is tri-state: leave it alone, set a number, or set `0` to freeze one member without
revoking their grant. Resetting it to the site-wide default is a separate flag.

### Watching the spend

**Admin › Lumi** shows month-to-date and 30-day cost, token totals with the cached
share broken out, the number of granted members and threads, and a per-member spend
list, so an unusual bill has a name attached.

These figures are **estimates**, computed from published per-million rates at call
time, not read from a vendor's billing API. They track real spend closely but will not
match an invoice to the cent.

Every provider call writes one row to the usage ledger, so a single member
message with two tool round-trips writes three rows.

## What's stored, and for how long

The schema ships as `migrations/002_lumi_chat.sql` and applies itself on deploy.

| Table | Holds | Retention |
| --- | --- | --- |
| `chat_settings` | The single operator settings row: switch, provider, model, budgets. | kept |
| `chat_conversations` | One row per thread. | pruned **30 days** after its last message |
| `chat_messages` | Member messages, her rendered replies, and any action cards. | with their conversation (`ON DELETE CASCADE`) |
| `chat_usage` | One row per provider call, with token counts and an estimated cost. | pruned after **180 days** |

Tool traffic is **not** persisted: results are regenerated from live data on replay,
and keeping them would feed stale recommendations back into the model. A prune sweep
runs every 12 hours.

A conversation id belonging to another account resolves to a **new** thread rather
than an error, so a stale id cannot be used to probe for someone else's conversation.
Deleting an account deletes its threads, messages and ledger rows.

## What leaves your server

This is the one place where the usual promise (nothing leaves your server) does not
hold.

- **What is sent** to the selected provider: the member's message, the replayed
  history of that thread, their display name, up to five recently watched titles,
  and whatever the tools returned for that reply.
- **What is never sent**: emails, passwords, mnemonics, session tokens, IP
  addresses, or anything at all about members who aren't chatting.
- **What never touches the database**: the API keys. They stay in the environment,
  so a dump of your database never carries billable credentials. The dashboard is told
  only whether each key is *present*, never its value.

:::caution[On the Nightshade path?]
[Absolute privacy](/deployment/absolute-privacy/) assumes your nodes talk to as little
of the outside world as possible. A chatbot is an outbound, authenticated, billed call
to a commercial API. On that path, leave it off.
:::

## Waking her

1. **Put a key in the backend environment**: `ANTHROPIC_API_KEY` (recommended) or
   `GEMINI_API_KEY`. Under Compose or Swarm, also list it in the service's
   `environment:` block, or the container never sees it.
2. **Recreate the backend container**, then open **Admin › Lumi**. It should read
   *key present*.
3. **Pick a provider and model**, set a monthly budget, and tick **Lumi is awake**.
   Saving without a key for the selected provider is rejected, so no member hits the
   failure first.
4. **Grant individual members** on **Admin › Users** with the bot icon beside the
   admin toggle. Granted accounts show a *Lumi* badge.

## Configuration

Only the keys are environment variables. Everything else is operator state in the
database, changed from the dashboard without a redeploy.

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Claude. The recommended provider. |
| `GEMINI_API_KEY` | unset | Google AI Studio. `GOOGLE_API_KEY` is accepted as an alias. |

:::caution[Mind the `$` in your Compose file]
Writing `{GEMINI_API_KEY:-}` instead of `${GEMINI_API_KEY:-}` passes that literal
string through as the key. It reads as *present* to the feature gate, then every call
fails with `400 API_KEY_INVALID`.
:::

Managed from **Admin › Lumi** instead: the master switch, provider, model, the
site-wide monthly token budget, history turns and max tool rounds. Managed from
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

- The chatbot is **optional and triple-gated**: a session, a site-wide switch that
  starts off, and a per-account grant that starts denied. Mounting the routes exposes
  nothing.
- Its five tools are **thin wrappers over existing engines**, so answers cannot drift
  from the rest of the backend, and it is told to admit an empty result rather than
  invent one.
- **Provider, model and budgets are database-backed** and switch from the
  dashboard. Only the API keys are environment variables, so a database dump
  never carries billable credentials.
- **Spend is bounded** by a per-member monthly token budget, a history cap, a
  tool-round ceiling and a rate limit, and every call lands in a ledger the
  dashboard totals for you.
- Threads are pruned after 30 days, ledger rows after 180, automatically.
