---
title: Specials, OVAs & films
description: How a show's side content is discovered, listed and played, covering the tmdb_extras mapping, the two watch paths an extra can take, and the film index the s.to family hides them behind.
---

A season is easy. Everything *around* a season is not: the OVA that shipped with
a Blu-ray, the four-minute chibi shorts, the two recap films, the theatrical
sequel. Crimson Haven calls all of it **extras**, and it is the one part of a
show that no single upstream describes completely.

Overlord is the worked example throughout, because it has every shape of the
problem at once: six *Ple Ple Pleiades* shorts, two recap films, and a
theatrical feature that TMDB tracks as a movie in its own right.

## Where extras come from

Extras live in one table, `tmdb_extras`, keyed by the parent show's TMDB id.
Three separate mechanisms fill it, because no one of them is enough.

### 1. Fribb's own grouping

The [Fribb anime-lists](https://github.com/Fribb/anime-lists) dataset gives most
entries a `themoviedb_id.tv` and a season number. Anything landing on season 0,
or losing a contested season slot, becomes an extra of that show. This finds the
*Nazarick Saidai no Kiki* OVA and the first recap film, and nothing else of
Overlord's.

### 2. Films TMDB tracks as movies

A film with its own TMDB movie page carries `themoviedb_id: {"movie": [...]}`
and **no** `tv` key, so it has no show to group under. Where such an entry
repeats its parent series' `tvdb_id` it is attached to that show anyway, and its
movie id is kept alongside, in `tmdb_extras.tmdb_movie_id`. That id is the
routing signal the frontend reads: it is what sends the entry down the movie
watch path instead of a season/episode URL a film has no page for.

*OVERLORD: The Sacred Kingdom* arrives this way.

### 3. AniList relations

Roughly a third of the Fribb dataset carries no external id at all, so those
entries can never be grouped by id. AniList names them: the mapping build asks
for each mapped entry's `relations` and treats the side-content edges
(`SIDE_STORY`, `SUMMARY`, `SPECIAL`, `PARENT`, `ALTERNATIVE`) as extras of the
show, provided the related entry is itself a `SPECIAL`, `OVA`, `ONA` or `MOVIE`.

This is what recovers five of the six *Ple Ple Pleiades* entries and the second
recap film. It walks one hop out from **every** mapped member of a show, not
just season 1, which is how a special hanging off season 4 is found.

:::caution[Relations run only at mapping-build time]
Mechanisms 2 and 3 are part of the Fribb rebuild, so they take effect on the
**next mapping resync**, not on deploy. Until that runs, a show keeps exactly
the extras the old grouping gave it. Trigger one from **Admin → System →
metadata resync**, and watch `/health`'s `entries_count` climb as confirmation.
:::

:::note[What is deliberately not an extra]
`SEQUEL` and `PREQUEL` edges (a season or a show of its own), `CHARACTER`
crossovers (Isekai Quartet is not an Overlord special), and the manga/novel
`ADAPTATION` edges. One consequence worth knowing: a theatrical *sequel* film is
an AniList `SEQUEL`, so it is found only by mechanism 2 — through its TMDB movie
id — never by relations.
:::

## How an extra is played

An extra has no season and no episode, so there is no single watch URL that
suits both kinds. The overview page splits them:

```
   extra has tmdb_movie_id ?
   │
   ├── yes ──► /watch-movie/{tmdb_movie_id}
   │           the movie pipeline, on the film's own TMDB id
   │
   └── no  ──► /watch/{anilist_id}/0/1
               the anime pipeline, as season 0 (the specials season)
```

The anime path streams through `/watch/{anilist_id}/{episode}`, which recognises
an unmapped-to-any-season id as an extra and serves it from season 0. It used to
borrow season 1, which pointed every special at the first episode of the show
proper and minted its cache ticket under that episode's key.

### Telling the sources engine *which* item

Finding an extra is two separate problems, and the media context carries them
separately:

| Field | Carries | Used for |
| --- | --- | --- |
| `title`, `titleEnglish`, … | the **parent show's** titles | finding the show on the target site |
| `extraTitle` | the **extra's own** title | picking it out of that show's film list |

This split matters because the s.to family (s.to, aniworld and their mirrors)
does not put extras under `staffel-N` at all. Every special, OVA and film of a
show is collected in one **"Filme"** list, numbered in the site's own order —
Overlord's three movies are `film-22` through `film-24`, sitting behind 21
Pleiades shorts. That numbering matches nothing AniList or TMDB knows, so the
only way in is: find the show normally, read its film index, and match
`extraTitle` against the rows.

The site's titles are not AniList's and never will be — "Overlord: The Undead
King" is listed as "The Undead King - Theater Manners Movie 1[Movie]" — so the
match strips the show's own name off the front and scores what remains, with an
exact hit beating a containment hit. Scoring rather than first-match is what
keeps "Ple Ple Pleiades" from claiming the row belonging to "Ple Ple Pleiades 3".

A source with no such list simply ignores `extraTitle` and skips extras, exactly
as it did before.

## How extras are shown

On an overview page, extras appear under **Specials & Movies**, split into two
groups — *Movies* and *Specials & OVAs* — each in release order. An entry counts
as a film when AniList calls it a `MOVIE` **or** it carries a `tmdb_movie_id`, so
the grouping can never disagree with the watch path it routes to. A show with
only one kind gets no sub-headings, since the section title already says it.

On the watch page an extra is treated as a single self-contained item, like a
movie: it shows its own name, and the season badge, episode title, per-episode
stat boxes, Auto-Next and the season/episode picker are all absent. The metadata
around it (poster, synopsis) still comes from the parent season, which is why
the per-episode fields have to be suppressed rather than merely left empty —
otherwise a special would announce itself as episode 1 of the show.

Watch progress is stored under the extra's own AniList id and its own title, so
"continue watching" reads *Overlord: The Undead King* and never collides with
the show's real first episode.

## When a show is missing its extras

Work down this list, in order.

1. **Has the mapping been resynced since the extras build shipped?** This is by
   far the most common cause. `/health`'s `entries_count` counts `anime_entries`
   rows; if it matches the number of Fribb entries carrying a `themoviedb_id.tv`
   and nothing more, the relations pass has never run.
2. **Is the entry an AniList `SEQUEL`?** Then it needs a TMDB movie id to be
   found at all. Check the Fribb row for `themoviedb_id.movie`.
3. **Does it play?** A listed extra that resolves no sources means the sources
   engine bundled into the client predates film-index support. Check which
   commit `vendor/crimson-sources` is pinned to — the client bundles the engine
   at build time, so an old submodule pin ships an old engine no matter how
   current the rest of the deploy is.
