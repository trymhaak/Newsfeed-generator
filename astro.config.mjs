import { defineConfig } from 'astro/config';

// Hosting target is configurable so the same source serves both deploys without
// a code change (reversible cutover — see CUTOVER-RUNBOOK.md):
//   - GitHub Pages (current, default): base '/Newsfeed-generator' on
//     trymhaak.github.io
//   - Cloudflare Pages (planned): base '/' on a custom domain
// Override at build time, e.g.:
//   SITE_BASE=/ SITE_URL=https://news.example.com npm run build
const site = process.env.SITE_URL ?? 'https://trymhaak.github.io';
const base = process.env.SITE_BASE ?? '/Newsfeed-generator';

export default defineConfig({
  site,
  base,
  build: {
    format: 'directory',
  },
  trailingSlash: 'ignore',
});
