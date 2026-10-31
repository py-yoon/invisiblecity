// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 미리보기는 /invisiblecity/ 아래에서, 실제 도메인은 루트에서 돈다.
const SITE = process.env.SITE ?? 'https://invisiblecity.co.kr';
const BASE = process.env.BASE ?? '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
