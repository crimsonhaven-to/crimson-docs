---
title: Messages between members
description: "Private chats and groups between signed-in members: handles, song and show cards, blocking, how new messages arrive, and what is stored."
---

Signed-in members can message each other inside crimsonhaven: private two-person chats
and named groups. A message can carry a **song** or a **show** as a card next to its
text, so "you have to watch this" is one tap from the overview page.

It needs no configuration and no grant. Every signed-in member can use it once they
pick a handle. Nothing about it is reachable from outside the login wall.

## What a member sees

| Where | What |
| --- | --- |
| Navigation | A **Messages** icon with a badge counting unread messages |
| `/messages` | The inbox beside the open chat (on a phone, one or the other) |
| Settings, **Your Handle** | Pick or change your `@handle` |
| An anime, show, movie or manga overview | **Send to a friend** |
| Now Playing and a shared song's page | A send icon beside the share icon |

**Send to a friend** opens a picker with your chats, plus a field for any `@handle`,
and an optional note. Sending to a handle opens (or reuses) your private chat with them.

## Handles

The display name stays a non-unique greeting. The **handle** is how members find each
other: unique, 3 to 20 characters, lowercase letters, digits and `_`, starting with a
letter. It is stored lowercase, so `@Ray` and `@ray` are the same handle.

A member has no handle until they pick one. Messages asks for it first, and every
messaging endpoint except the unread count answers `409` until then. A handle can be
changed but not cleared; chats show the new one everywhere, including old messages.

There is no member directory. You start a chat by typing someone's exact handle, so
share yours with the people you want to hear from.

## Chats and groups

| | Private chat | Group |
| --- | --- | --- |
| Members | exactly two | 2 to 32 |
| Started by | typing one handle | a name and one or more handles |
| Name | the other person's | its own, any member can rename it |
| Adding people | no | any member can add |
| Leaving | no, block instead | yes; the last one out deletes it and its messages |

The same two people always land in the same private chat, whoever starts it.

## Song and show cards

| Card | Who can send it | What opens |
| --- | --- | --- |
| Song | someone with the song in their library, or someone who was sent it | the [shared song page](/self-hosting/music/#sharing-a-song), which plays it for any member |
| Anime, show, movie, manga | anyone | the title's overview page |

A song card carries the song's share token, which only a member with the song in
their own playlists can mint, so a message cannot invent a song nobody shared. The
card is a snapshot (title, artists, album, cover) taken when it is sent, so it still
reads right after the song leaves the library; only opening it then says it is gone.
A poster or cover is kept only if it is an `https://` URL.

## Blocking

From a private chat's settings, a member can block the other person. A block:

- stops messages in that private chat in **both** directions, until it is lifted;
- stops the blocked member starting a new private chat with you;
- stops them adding you to a group.

It does not remove you from a group you already share; leave the group for that. The
blocked member sees "is not accepting your messages" when they try.

## How new messages arrive

There is no websocket or push. Clients poll, which works the same behind any number
of API replicas:

| What | Request | Every |
| --- | --- | --- |
| Unread badge | `GET /messages/unread` | 20 s |
| Inbox | `GET /messages/rooms` | 15 s, while Messages is open |
| Open chat | `GET /messages/rooms/{id}/messages?after=<newest id>` | 4 s, while the chat is open |

All three pause while the tab is hidden and catch up the moment it is shown again.
Each is one indexed query, so a few hundred members cost little.

## Limits

| Limit | Value |
| --- | --- |
| Message text | 2000 characters |
| Group name | 60 characters |
| Group size | 32 members |
| Sending | 30 messages a minute per member |
| Starting private chats | 20 a minute |
| Creating groups | 10 a minute |
| Looking up a handle | 30 a minute (each answer says whether a handle exists) |

## The endpoints

| Method and path | Does |
| --- | --- |
| `PUT /account/handle` | pick or change your handle (`409` if taken) |
| `GET /messages/unread` | the badge count (`0` without a handle) |
| `GET /messages/rooms` | your chats, newest first, with members, unread count and last message |
| `GET /messages/rooms/{id}` | one chat |
| `POST /messages/direct` | open the private chat with `{handle}` |
| `POST /messages/groups` | create a group from `{name, handles}` |
| `PATCH /messages/rooms/{id}` | rename a group |
| `POST /messages/rooms/{id}/members` | add `{handles}` to a group |
| `DELETE /messages/rooms/{id}/membership` | leave a group |
| `GET /messages/rooms/{id}/messages` | a page of messages: newest, `before=<id>`, or `after=<id>` |
| `POST /messages/rooms/{id}/messages` | send `{body, attachment}` |
| `POST /messages/rooms/{id}/read` | mark read up to `{last_id}` |
| `GET /messages/members/{handle}` | look a member up, and whether you blocked them |
| `PUT` / `DELETE /messages/blocks/{handle}` | block or unblock |

Someone else's chat answers `404`, exactly like one that does not exist. Account ids
never appear in responses; members are known to each other only by handle.

## Storage & retention

`migrations/014_member_messages.sql` adds `accounts.handle` and four tables:
`messaging_rooms`, `messaging_members`, `messaging_messages` and `messaging_blocks`.

- Messages are stored **unencrypted** in Postgres and kept until their chat is
  deleted. Anyone with access to the database can read them; tell your members.
- Deleting an account removes its memberships and blocks. Its messages stay, shown
  as from "a former member".
- A member cannot delete or edit a message in this version.
