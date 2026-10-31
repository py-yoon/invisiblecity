import { getCollection, type CollectionEntry } from 'astro:content';
import taxonomy from '../data/taxonomy.json';

export const SITE_TITLE = 'invisiblecity';
export const SITE_DESC = '보이지 않는 도시연구소';
export const PER_PAGE = 10;

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
    p.data.cover ||= body.match(/!\[[^\]]*\]\((\/uploads\/[^)\s]+)/)?.[1];
  }
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function groupBy(posts: Post[], key: 'categories' | 'tags') {
  const map = new Map<string, Post[]>();
  for (const p of posts) for (const n of p.data[key]) map.set(n, [...(map.get(n) ?? []), p]);
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

// 워드프레스 테마와 같은 날짜 형식: 본문 2026-10-04, 꼬리말 10/4/2026
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'", '#039': "'" };
const decodeEntities = (s: string) => s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m);
/** 워드프레스 기본 요약처럼 본문 앞 55단어. 요약을 직접 쓴 글은 그것을 쓴다. */
export function excerptOf(p: Post) {
  const custom = p.data.description;
  if (custom && !p.data.wpId) return decodeEntities(custom);
  const text = decodeEntities((p.rendered?.html ?? '').replace(/<(style|script)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  const words = text.split(' ');
  return words.length > 55 ? words.slice(0, 55).join(' ') + '…' : text;
}

export const fmtDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
export const fmtShortDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', year: 'numeric' }).format(d);

/** 소제목(h2·h3)이 3개 이상인 글의 목차 */
export function tocOf(html: string) {
  const items = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)].map(([, level, id, inner]) => ({
    level: Number(level),
    id,
    text: decodeEntities(inner.replace(/<[^>]+>/g, '')).trim(),
  })).filter((h) => h.text);
  return items.length >= 3 ? items : [];
}
