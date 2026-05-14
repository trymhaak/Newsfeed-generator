import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://trymhaak.github.io',
  base: '/newsfeed-generator',
  build: {
    format: 'directory',
  },
  trailingSlash: 'ignore',
});
