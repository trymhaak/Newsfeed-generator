import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://trymhaak.github.io',
  base: '/Newsfeed-generator',
  build: {
    format: 'directory',
  },
  trailingSlash: 'ignore',
});
