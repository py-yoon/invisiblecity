import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postUrl, SITE_TITLE, SITE_DESC } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPosts();
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
