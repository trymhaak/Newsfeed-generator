import { defineConfig } from 'astro/config';

// The old public host now serves only the machine feed and retirement fallback.
// The launchd deploy sets the same values explicitly for auditability.
const site = process.env.SITE_URL ?? 'https://newsfeed.trym.cloud';
const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  site,
  base,
  build: {
    format: 'directory',
  },
  trailingSlash: 'ignore',
});
