# crimson-docs 🩸📖

The **Royal Archives** — the comprehensive self-hosting documentation for
[Crimson Haven](https://crimsonhaven.to), published at
**[docs.crimsonhaven.to](https://docs.crimsonhaven.to)**.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build),
themed in the crimson house style and narrated by Luminas herself.

## Develop locally

```bash
npm install
npm run dev        # http://localhost:4321
```

## Build

```bash
npm run build      # static site → ./dist
npm run preview    # serve the built site locally
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes it to **GitHub Pages**. The custom domain is set by
[`public/CNAME`](public/CNAME) (`docs.crimsonhaven.to`).

One-time setup in the repo: **Settings → Pages → Source: GitHub Actions**, then point a
`docs` DNS record at `<org>.github.io` (see the
[Domains guide](https://docs.crimsonhaven.to/deployment/domains/)).

## Structure

```
src/
  content/docs/        the documentation pages (Markdown / MDX)
    welcome/  getting-started/  architecture/
    self-hosting/  deployment/  reference/  help/
  styles/crimson.css   the crimson Starlight theme
  assets/lumi.png      the mascot (logo + hero)
astro.config.mjs       site config + sidebar
public/CNAME           the custom domain
```

## Writing

- Pages are Markdown (`.md`) or MDX (`.mdx`) with Starlight frontmatter
  (`title`, `description`).
- Lumi's voice lives in intros and `:::tip[Lumi says]` asides.
- The sidebar is defined in `astro.config.mjs`; add a page there when you add a file.
- The **sources** are intentionally documented only as a *mechanism* (how to add your
  own private submodule) — no providers are named. Keep it that way.
