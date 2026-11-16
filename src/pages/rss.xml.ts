import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postUrl, hubOf, SITE_TITLE, SITE_DESC } from '../lib/site';

export async function GET(context: APIContext) {
  // 날짜별 자동 글(noindex)은 피드에 싣지 않는다.
  const posts = (await getPosts()).filter((p) => !hubOf(p));
  return rss({
    title: SITE_TITLE,
    description: SITE_DESC,
    site: context.site!,
    items: posts.slice(0, 30).map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.description,
      link: postUrl(p),
      categories: p.data.categories,
    })),
  });
}
