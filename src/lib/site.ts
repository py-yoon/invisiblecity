import { getCollection, type CollectionEntry } from 'astro:content';
import taxonomy from '../data/taxonomy.json';

export const SITE_TITLE = 'invisiblecity';
export const SITE_DESC = '보이지 않는 도시연구소';
export const PER_PAGE = 12;

export type Post = CollectionEntry<'posts'>;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
/** 사이트 안 경로에 base를 붙인다. */
export const url = (p: string) => base + p;
/** 원본 HTML(페이지)의 루트 경로에도 base를 붙인다. */
export const withBase = (html: string) =>
  base ? html.replace(/\s(href|src)="\/(?!\/)/g, ` $1="${base}/`) : html;

export const postSlug = (p: Post) => p.data.slug ?? p.id;
export const postUrl = (p: Post) => url(`/${postSlug(p)}/`);

// 워드프레스 sanitize_title과 같은 규칙. 옛 슬러그는 표에서 먼저 찾는다.
const unescape = (s: string) => s.replace(/&amp;/g, '&');
function lookup(map: Record<string, string>, name: string) {
  for (const [k, v] of Object.entries(map)) if (unescape(k) === name) return v;
  return name.toLowerCase().replace(/[\/&]/g, '-').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
}
export const categorySlug = (name: string) => lookup(taxonomy.categories, name);
export const tagSlug = (name: string) => lookup(taxonomy.tags, name);
export const categoryUrl = (name: string) => url(`/category/${categorySlug(name)}/`);
export const tagUrl = (name: string) => url(`/tag/${tagSlug(name)}/`);

export async function getPosts() {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  // CMS로 쓴 글에 요약·대표 이미지가 없으면 본문에서 채운다.
  for (const p of all) {
    const body = p.body ?? '';
    p.data.description ||= body.replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_|`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    p.data.cover ??= body.match(/!\[[^\]]*\]\((\/uploads\/[^)\s]+)/)?.[1];
  }
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function groupBy(posts: Post[], key: 'categories' | 'tags') {
  const map = new Map<string, Post[]>();
  for (const p of posts) for (const n of p.data[key]) map.set(n, [...(map.get(n) ?? []), p]);
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
