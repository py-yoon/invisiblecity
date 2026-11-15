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

/** 매일 자동으로 쌓이는 청약 글. 일반 글 목록을 덮지 않게 첫 화면에 따로 보여 준다. */
export const FEED_CATEGORIES = ['청약 결과', '분양 일정'];
export const isFeed = (p: Post) => p.data.categories.some((c) => FEED_CATEGORIES.includes(c));

/** 날짜별 자동 글 → 고정 주소 하나로 모은다. 날짜별 글은 noindex·사이트맵 제외, 고정 페이지만 색인한다(같은 틀 글이 대량으로 쌓여 저품질로 보이지 않게). */
export const HUBS = [
  { slug: '청약-결과', prefix: '청약-결과-', take: 7, title: '아파트 청약 결과 (최근 7회)', description: '최근 접수를 마친 아파트의 주택형별 1순위 경쟁률과 새로 공개된 당첨 가점. 청약홈 자료로 매일 갱신한다.' },
  { slug: '분양-일정', prefix: '분양-일정-', take: 1, title: '아파트 분양 일정 (앞으로 2주)', description: '앞으로 2주 동안 청약을 받는 아파트의 특별공급·1순위 접수일, 당첨자 발표일, 분양 최고가. 청약홈 자료로 매주 갱신한다.' },
  { slug: '산업용지-공급-공고', prefix: '산업용지-공급-공고-', take: 1, title: '지금 접수 중인 산업용지 공급 공고', description: '신청을 받고 있는 산업단지 산업용지 분양·매각 공고와 LH 산업시설·자족시설용지 공고의 접수 기간, 면적, ㎡당 가격. 공장용지 지도 자료로 2주마다 갱신한다.' },
] as const;
export const hubOf = (p: Post) => HUBS.find((h) => postSlug(p).startsWith(h.prefix) && /^\d{4}-/.test(postSlug(p).slice(h.prefix.length)));
