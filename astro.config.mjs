// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// The Royal Archives live at docs.crimsonhaven.to (a GitHub Pages custom domain
// → served at the root, so no `base` is needed; the CNAME is in public/).
export default defineConfig({
  site: "https://docs.crimsonhaven.to",
  integrations: [
    starlight({
      title: "Crimson Haven",
      tagline: "The Royal Archives — self-host your own sanctuary.",
      logo: {
        src: "./src/assets/lumi.png",
        alt: "Luminas, the Vampire Queen",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      description:
        "Comprehensive documentation for self-hosting Crimson Haven — the backend, " +
        "client, CORS proxy, companion extension and your own private sources.",
      customCss: ["./src/styles/crimson.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/crimsonhaven-to",
        },
      ],
      // Lumi's voice, applied to the auto-generated chrome.
      lastUpdated: true,
      pagination: true,
      editLink: {
        baseUrl:
          "https://github.com/crimsonhaven-to/crimson-docs/edit/main/",
      },
      sidebar: [
        {
          label: "Welcome",
          items: [
            { label: "Enter the Haven", link: "/" },
            { label: "What is Crimson Haven?", slug: "welcome/what-is-it" },
          ],
        },
        {
          label: "Getting Started (the easy path)",
          items: [
            { label: "Before you begin", slug: "getting-started/before-you-begin" },
            { label: "Quick start in 30 minutes", slug: "getting-started/quick-start" },
            { label: "First login & admin", slug: "getting-started/first-login" },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "The big picture", slug: "architecture/big-picture" },
            { label: "The New System (E0–E3)", slug: "architecture/new-system" },
            { label: "Browsing & discovery", slug: "architecture/browsing-and-discovery" },
            { label: "The five repositories", slug: "architecture/repositories" },
          ],
        },
        {
          label: "Self-Hosting Guide",
          items: [
            { label: "The backend (the brain)", slug: "self-hosting/backend" },
            { label: "The database (PostgreSQL)", slug: "self-hosting/database" },
            { label: "The client (the frontend)", slug: "self-hosting/client" },
            { label: "The CORS proxy (the edge)", slug: "self-hosting/proxy" },
            { label: "The companion extension", slug: "self-hosting/extension" },
            { label: "Adding your own sources", slug: "self-hosting/sources" },
            { label: "The reading surface (manga)", slug: "self-hosting/manga" },
            { label: "The local media library", slug: "self-hosting/local-library" },
            { label: "The Live TV surface (IPTV)", slug: "self-hosting/live-tv" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "Single host (Docker Compose)", slug: "deployment/single-host" },
            { label: "Production cluster (Swarm)", slug: "deployment/swarm" },
            { label: "The CI/CD pipeline", slug: "deployment/cicd" },
            { label: "Domains, TLS & Cloudflare", slug: "deployment/domains" },
            { label: "Absolute privacy (Nightshade)", slug: "deployment/absolute-privacy" },
          ],
        },
        {
          label: "Configuration Reference",
          items: [
            { label: "Backend environment", slug: "reference/backend-env" },
            { label: "Proxy & edge secrets", slug: "reference/proxy-env" },
            { label: "Accounts & the login wall", slug: "reference/accounts" },
            { label: "Operator-owned sources", slug: "reference/operator-sources" },
          ],
        },
        {
          label: "Help",
          items: [
            { label: "Q&A — Lumi answers", slug: "help/faq" },
            { label: "Troubleshooting", slug: "help/troubleshooting" },
            { label: "Glossary", slug: "help/glossary" },
          ],
        },
      ],
    }),
  ],
});
