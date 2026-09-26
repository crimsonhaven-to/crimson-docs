# crimson-docs 🩸📖

**The Royal Archives**: the Crimson Haven self-hosting docs, explained by Lumi herself.
Built with Astro + Starlight, served at [docs.crimsonhaven.org](https://docs.crimsonhaven.org).

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server with live reload |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built site locally |

Pages live in `src/content/docs/`; the sidebar is in `astro.config.mjs`. Pushes to the
default branch that change the site deploy it to GitLab Pages (`.gitlab-ci.yml`).

## 📜 License

Released under the **MIT License**; see [`LICENSE`](LICENSE). Take it, fork it, remix
it. ( ˶ ˆ ᗜ ˆ ˶ )

A small request from me 🩸: MIT only asks you to keep the copyright notice, but I'd
love a link back to the original home,
[`crimsonhaven-to`](https://gitlab.ramon.moe/crimsonhaven-to), in anything you build
on this. Not a legal demand, just a kindness that helps others find the source. ( ^ . ^ )
