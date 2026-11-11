// @ts-check
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import sitemap from '@astrojs/sitemap';

// GitHub Pages 미리보기는 /invisiblecity/ 아래에서, 실제 도메인은 루트에서 돈다.
const SITE = process.env.SITE ?? 'https://invisiblecity.co.kr';
const BASE = process.env.BASE ?? '/';

// 사이트맵에 넣을 글별 수정일·대표 이미지 (Rank Math 사이트맵처럼)
const postInfo = new Map();
for (const f of fs.readdirSync('src/content/posts')) {
  const fm = fs.readFileSync(`src/content/posts/${f}`, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const get = (k) => fm.match(new RegExp(`^${k}: *"?([^"\n]*)"?$`, 'm'))?.[1];
  if (get('draft') === 'true') continue;
  const slug = get('slug') || f.replace(/\.md$/, '');
  postInfo.set(encodeURI(`/${slug}/`), { lastmod: get('updated') || get('date'), cover: get('cover') });
}
const base = BASE.replace(/\/$/, '');

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // public/ 아래 정적 앱 페이지는 Astro가 모르니 직접 넣는다.
      customPages: [new URL('underground/', SITE + BASE).href],
      // 워드프레스(Rank Math) 사이트맵처럼 글·페이지·카테고리만. 태그·목록 쪽수는 색인은 허용하되 사이트맵에는 넣지 않는다.
      filter: (page) => !/\/(search|admin|tags|categories)\/$|\/tag\/|\/page\/\d+\/$/.test(page),
      serialize(item) {
        const info = postInfo.get(new URL(item.url).pathname.slice(base.length));
        if (info?.lastmod) item.lastmod = new Date(info.lastmod).toISOString();
        if (info?.cover) item.img = [{ url: new URL(base + info.cover, SITE).href }];
        return item;
      },
    }),
  ],
  build: { format: 'directory' },
});
