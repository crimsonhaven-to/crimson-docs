---
title: The airing calendar & follows
description: The weekly broadcast schedule, per-title follows, and the optional email that tells a member when a new episode has aired.
---

The backend has always asked AniList for `nextAiringEpisode` on every title it
fetched, and always thrown it away. It now keeps it: there is a week's broadcast
schedule, members can **follow** a title, and (if you switch it on) they get an
email when one of their follows airs.

Three pieces, and only the third one costs you anything:

| Piece | Gate | What it is |
| --- | --- | --- |
| `GET /calendar` | always on | The airing window, with the caller's follows flagged. |
| `/account/subscriptions` | always on | Follow, unfollow, list. |
| The notification job | `AIRING_NOTIFY_ENABLED`, **off** by default | One email per followed episode. |

The calendar and follows are read-mostly and useful on their own, so they are not
gated behind a flag. Only the part that reaches a human inbox is.

## What a member sees

**Calendar** joins the top navigation for signed-in visitors. The page draws the
whole week, lights up the titles this viewer follows, and carries an **Only mine**
toggle. A bell beside each row follows or unfollows in place, and the same control
sits next to the watchlist button on every title page.

Below the schedule the page lists **everything you follow**, whether or not it airs
this week. A long-running show spends most of its life between seasons, and without
that list a follow made in April is invisible (and un-unfollowable) in July.

A single banner at the top says whether follows on this account can actually be
mailed. That answer comes from the API, not from the client guessing: see
[who can be mailed](#who-can-be-mailed) below.

## Turning the email on

The email needs `SMTP_*` configured (the same mailer that sends verification and
reset mail) and two flags:

```ini
AIRING_NOTIFY_ENABLED=true
# Rehearse first. Claims each notice for real, logs who WOULD be mailed,
# and never opens an SMTP connection:
AIRING_NOTIFY_DRY_RUN=true
```

:::caution[Rehearse, then commit]
Turn `AIRING_NOTIFY_DRY_RUN` on first, watch one run in the logs, then turn it off.
This is the one feature in the backend a redeploy cannot take back: a wrong send has
already arrived. Note the dry run's claims are **real**, so a rehearsed episode is
not re-sent when you go live. That is deliberate, because the claim path is the part
worth rehearsing.
:::

`config_report` prints the feature in three states rather than two (off, rehearsing,
live), because a dry run and a live run both read as "enabled" in the environment
while only one of them reaches anybody.

### Where the jobs run

Both jobs are pinned to the `RUN_DB_SYNC` replica, like the metadata jobs:

| Job | Interval | Does |
| --- | --- | --- |
| `airing_refresh_job` | 6 hours | Pulls the window from AniList into `airing_schedule`. |
| `airing_notify_job` | 10 minutes | Claims and sends what has aired. Touches only the database until it has something to send. |

The schedule is also warmed once off the boot path, so a fresh deploy does not serve
an empty calendar until the first tick.

Six hours is not laziness: a broadcast slipping is the only thing that changes in
that table, so a tighter interval spends AniList requests to learn nothing. The
notice half runs ten-minutely because it should follow the airing closely.

The window is fetched **unfiltered**, not once per followed id. Asking AniList for
every anime airing in the week costs the same handful of requests as asking only for
the followed ones, and it is what lets the calendar show the whole week instead of
only your own shows.

## The rules that keep it honest

### Claim before send, never after

The send is not transactional with the ledger write, so the two orderings fail
differently: claim-then-send can drop a notice on a crash, send-then-claim can mail
the same episode on every tick forever. The backend claims first, with an
`INSERT ... ON CONFLICT DO NOTHING` whose rowcount **is** the claim, and records
`sent` or `failed` afterwards so a failure stays visible and bounded.

That also means a second replica running the job by mistake is harmless rather than
a duplicate-mail incident. It should not need to be, which is why the job is pinned
anyway.

### A lookback window bounds the queue

Only episodes that aired within the last **36 hours** are eligible. Without that
lower bound, the first run after you enable the feature would mail every subscriber
about every episode in the table, and a member who verified their address today
would receive a backlog.

It also means a few hours of downtime catches up instead of silently dropping what
it missed. One tick sends at most 200 notices; the rest are picked up next tick,
still inside the window.

### The copy says "aired in Japan"

`airingAt` is the Japanese broadcast time. The backend genuinely cannot know when a
source has an episode, because third-party sources resolve in the viewer's own
browser by design. The mail therefore says an episode **aired in Japan** and that
sources may take a while to catch up. It never says "available now", because that is
a promise the architecture cannot keep and a support burden you would pay for.

### Who can be mailed

Only accounts with a **verified email address**. Mnemonic accounts have a public key
and no email, and an unverified address must not be mailed either, so both are
skipped silently by the sender.

Following is still allowed for those accounts, because the calendar is useful on its
own. The API says so rather than letting the member wonder: every subscription
response carries `email_notifications`, and the client turns that into the banner on
the calendar page. A member can also opt one follow out of mail with `notify_email`
while keeping it on the calendar.

### A slipped broadcast moves, it does not duplicate

The refresh upserts on `(anilist_id, episode)`, so a delayed episode moves its row
rather than adding a second one. An episode already claimed is **not** re-sent, which
is exactly why the claim is keyed on the episode number and not on a time.

## Naming a brand new season

Resolving titles through the local `anime_entries` catalogue does not work here: the
Fribb resync lags a new season by weeks, and a brand new seasonal show is precisely
what somebody wants to follow. Driven against a real AniList window, **0 of 134**
airings had a name and rendered as `AniList #191832`.

So `airing_schedule` carries its own `title`, filled from the `media { title }` the
poller now asks for in the request it was already making (no extra upstream cost).
Lookup order is the subscription's own snapshot first (what the member saw when they
followed it), then the schedule's, then the catalogue's. A refresh that comes back
without a name never erases one already stored.

## The endpoints

All behind the login wall.

| Endpoint | Purpose |
| --- | --- |
| `GET /calendar?days=7&back=1` | The window, each item flagged `subscribed`. `days` and `back` are 0 to 31; the table itself is filled 7 days ahead. |
| `GET /account/subscriptions` | Your follows, each with its next scheduled episode, plus `email_notifications`. |
| `POST /account/subscriptions` | Follow `{anilist_id, title?, poster?, notify_email?}`. The title and poster are snapshotted. |
| `DELETE /account/subscriptions/{anilist_id}` | Unfollow. `404` if you were not following it. |

A calendar item is `{anilist_id, episode, airing_at, subscribed, title, poster}`.

## Storage & retention

`migrations/004_airing.sql` adds three tables, and `007_airing_titles.sql` adds the
schedule's `title` column:

| Table | Key | Holds |
| --- | --- | --- |
| `airing_schedule` | `(anilist_id, episode)` | `airing_at`, `title`, `fetched_at` |
| `anime_subscriptions` | `(user_id, anilist_id)` | the title/poster snapshot, `notify_email` |
| `airing_notifications` | `(user_id, anilist_id, episode)` | `claimed_at`, `sent_at`, `status` |

The housekeeping sweep drops airings older than **30 days** and notification ledger
rows older than **a year**. Neither is configurable, because neither is a decision
worth making per deployment. Subscriptions cascade away with the account.

:::tip[Lumi says]
Leave `AIRING_NOTIFY_ENABLED` off and you still get the whole calendar and every
follow, with no SMTP server and nothing to get wrong. Switch it on the day you want
inboxes involved, and rehearse it first.
:::
