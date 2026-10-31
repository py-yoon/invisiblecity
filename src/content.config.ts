import fs from 'node:fs';
import path from 'node:path';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    description: z.string().default(''),
    cover: z.string().optional(),
    draft: z.boolean().default(false),
    wpId: z.number().optional(),
  }),
});

// 도구·지도 페이지는 스크립트가 든 HTML이라 마크다운을 거치지 않고 그대로 읽는다.
const pages = defineCollection({
  loader: {
    name: 'html-pages',
    load: async ({ store, parseData }) => {
      const dir = './src/content/pages';
      store.clear();
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
        const fm = Object.fromEntries(
          (m?.[1] ?? '').split('\n').map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean)
            .map(([, k, v]) => [k, v.startsWith('"') ? JSON.parse(v) : v]),
        );
        const id = fm.slug ?? file.replace(/\.html$/, '');
        const data = await parseData({ id, data: fm });
        store.set({ id, data, body: raw.slice(m ? m[0].length : 0) });
      }
    },
  },
  schema: z.object({ title: z.string(), slug: z.string().optional(), date: z.coerce.date() }),
});

export const collections = { posts, pages };
