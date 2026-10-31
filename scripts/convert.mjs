// 워드프레스 백업(wp-export.json + uploads)을 Astro 콘텐츠로 옮긴다.
// 사용: node scripts/convert.mjs [백업 폴더]  (기본 ../invisiblecity-backup)
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { strikethrough } from 'turndown-plugin-gfm';

const BACKUP = path.resolve(process.argv[2] ?? '../invisiblecity-backup');
const UPLOADS = path.join(BACKUP, 'wp/uploads');
const { items, categories, tags } = JSON.parse(fs.readFileSync(path.join(BACKUP, 'wp-export.json'), 'utf8'));

// 카테고리·태그의 옛 주소 슬러그를 그대로 쓰기 위해 이름→슬러그 표를 남긴다.
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/taxonomy.json', JSON.stringify({ categories, tags }, null, 1) + '\n');

const POSTS_DIR = 'src/content/posts';
const PAGES_DIR = 'src/content/pages';
const PUBLIC_UPLOADS = 'public/uploads';
for (const d of [POSTS_DIR, PAGES_DIR]) {
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

const byId = new Map(items.map((i) => [i.id, i]));
const bySlug = new Map(items.map((i) => [i.slug, i]));
const usedUploads = new Set();
const warnings = [];

// 옛 주소(https://invisiblecity.co.kr/...)를 사이트 안 경로로 바꾼다.
function localize(url) {
  const m = url.match(/^(?:https?:)?\/\/(?:www\.)?invisiblecity\.co\.kr(\/[^"'\s]*)?$/i);
  if (!m) return url;
  let p = m[1] || '/';
  const up = p.match(/^\/wp-content\/uploads\/([^?#]+)/);
  if (up) {
    const file = decodeURIComponent(up[1]);
    if (fs.existsSync(path.join(UPLOADS, file))) usedUploads.add(file);
    else warnings.push(`없는 이미지: ${file}`);
    return `/uploads/${file}`;
  }
  const [pathname, rest = ''] = p.split(/(?=[?#])/);
  const seg = decodeURIComponent(pathname).replace(/^\/|\/$/g, '');
  if (!seg) return '/' + rest;
  if (/^\d+$/.test(seg) && byId.has(+seg)) return `/${byId.get(+seg).slug}/` + rest;
  if (bySlug.has(seg)) return `/${seg}/` + rest;
  if (/^(category|tag)\//.test(seg)) return `/${seg}/` + rest;
  warnings.push(`연결 대상 없음: ${url}`);
  return `/${seg}/` + rest;
}

const youtubeId = (u) => u.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1];

// 구텐베르크 블록을 정리된 HTML로 바꾼다.
function prepare(html) {
  // 임베드: 유튜브는 iframe, 사이트 내부 글은 링크 카드
  html = html.replace(
    /<!-- wp:embed (\{.*?\}) -->[\s\S]*?<!-- \/wp:embed -->/g,
    (_, json) => {
      const { url } = JSON.parse(json);
      const yt = youtubeId(url);
      if (yt) return `<div class="embed video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="YouTube" loading="lazy" allowfullscreen></iframe></div>`;
      const href = localize(url);
      const target = bySlug.get(decodeURIComponent(href).replace(/^\/|\/$/g, ''));
      return `<p class="link-card"><a href="${href}">${target ? target.title : url}</a></p>`;
    },
  );
  // 시(verse) 블록: 줄바꿈을 살린 인용 상자
  html = html.replace(/<pre class="wp-block-verse">([\s\S]*?)<\/pre>/g, (_, inner) =>
    `<div class="verse">${inner.trim().replace(/\n/g, '<br>')}</div>`);
  // 버튼
  html = html.replace(/<a class="wp-block-button__link[^"]*"/g, '<a class="button"');
  // 구글 지도 등 iframe
  html = html.replace(/<p>\s*(<iframe[\s\S]*?<\/iframe>)\s*<\/p>/g, '$1');
  html = html.replace(/<iframe([^>]*?)(?:\swidth="\d+")?(?:\sheight="\d+")?([^>]*)><\/iframe>/g, (m, a, b) =>
    youtubeId(m) || m.includes('class=') ? m : `<div class="embed map"><iframe${a}${b} loading="lazy"></iframe></div>`);
  html = html.replace(/<!-- \/?wp:[^>]*-->/g, '');
  // 링크·이미지 주소
  html = html.replace(/\s(href|src)="([^"]+)"/g, (_, attr, url) => ` ${attr}="${localize(url.replace(/&amp;/g, '&'))}"`);
  html = html.replace(/\s(srcset|sizes)="[^"]*"/g, '');
  return html;
}

const td = new TurndownService({ headingStyle: 'atx', hr: '---', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
td.use(strikethrough);
td.keep((n) => n.nodeName === 'IFRAME' || (n.nodeName === 'DIV' && /\b(embed|verse)\b/.test(n.className)));
td.keep((n) => n.nodeName === 'P' && /\blink-card\b/.test(n.className));
td.addRule('wpTable', {
  filter: 'figure',
  replacement(content, node) {
    const table = node.querySelector('table');
    if (!table) return node.querySelector('img') ? figureImage(node) : '\n\n' + content + '\n\n';
    return tableToMarkdown(table, node.querySelector('figcaption')?.textContent?.trim());
  },
});
td.addRule('table', { filter: 'table', replacement: (_, node) => tableToMarkdown(node) });
td.addRule('buttons', {
  filter: (n) => n.nodeName === 'A' && n.className === 'button',
  replacement: (c, n) => `<a class="button" href="${n.getAttribute('href')}">${c}</a>`,
});

function figureImage(fig) {
  const img = fig.querySelector('img');
  const alt = (img.getAttribute('alt') || '').replace(/[\[\]]/g, '');
  const cap = fig.querySelector('figcaption')?.textContent?.trim();
  const link = fig.querySelector('a')?.getAttribute('href');
  let md = `![${alt}](${img.getAttribute('src')}${cap ? ` "${cap.replace(/"/g, "'")}"` : ''})`;
  if (link && link !== img.getAttribute('src') && !link.startsWith('/uploads/')) md = `[${md}](${link})`;
  return `\n\n${md}\n\n`;
}

function cellText(cell) {
  return td.turndown(cell.innerHTML).replace(/\n+/g, '<br>').replace(/\|/g, '\\|').trim();
}
function tableToMarkdown(table, caption) {
  if (table.querySelector('[colspan],[rowspan],table table')) return `\n\n${table.outerHTML}\n\n`;
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map(cellText));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  const out = [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)];
  return `\n\n${out.join('\n')}\n\n${caption ? `*${caption}*\n\n` : ''}`;
}

const yamlStr = (s) => JSON.stringify(s ?? '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8211;/g, '–').replace(/&#8212;/g, '—');
const kst = (d) => d.replace(' ', 'T') + '+09:00';
const fileName = (slug) => slug.replace(/[\/\\:*?"<>|]/g, '-');

function plainText(md) {
  return md.replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '').replace(/[#*_|`]+/g, ' ').replace(/\s+/g, ' ').trim();
}

let counts = { post: 0, page: 0, draft: 0 };
for (const it of items) {
  if (it.type === 'page' && it.status !== 'publish') continue;
  const html = prepare(it.content);
  if (it.type === 'page') {
    // 페이지는 도구·지도 같은 HTML이 많아 원본 HTML을 그대로 둔다.
    const fm = ['---', `title: ${yamlStr(decode(it.title))}`, `slug: ${yamlStr(it.slug)}`, `date: ${kst(it.date)}`, '---', ''];
    fs.writeFileSync(path.join(PAGES_DIR, fileName(it.slug) + '.html'), fm.join('\n') + html.trim() + '\n');
    counts.page++;
    continue;
  }
  const body = td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  const cover = body.match(/!\[[^\]]*\]\((\/uploads\/[^)\s]+)/)?.[1];
  const description = decode(it.description || it.excerpt || '') || plainText(body).slice(0, 140);
  const draft = it.status !== 'publish';
  const fm = [
    '---',
    `title: ${yamlStr(decode(it.title))}`,
    `slug: ${yamlStr(it.slug)}`,
    `date: ${kst(it.date)}`,
    it.modified > it.date ? `updated: ${kst(it.modified)}` : null,
    `categories: ${JSON.stringify(it.categories.filter((c) => c !== '미분류'))}`,
    `tags: ${JSON.stringify(it.tags.map(decode))}`,
    `description: ${yamlStr(description)}`,
    cover ? `cover: ${yamlStr(cover)}` : null,
    draft ? 'draft: true' : null,
    `wpId: ${it.id}`,
    '---',
    '',
  ].filter((l) => l !== null);
  fs.writeFileSync(path.join(POSTS_DIR, fileName(it.slug) + '.md'), fm.join('\n') + body + '\n');
  counts[draft ? 'draft' : 'post']++;
}

// 본문에 쓰인 이미지만 public/uploads로 복사
fs.rmSync(PUBLIC_UPLOADS, { recursive: true, force: true });
let bytes = 0;
for (const f of usedUploads) {
  const dst = path.join(PUBLIC_UPLOADS, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(UPLOADS, f), dst);
  bytes += fs.statSync(dst).size;
}
console.log(counts, `이미지 ${usedUploads.size}개 (${(bytes / 1e6).toFixed(1)}MB)`);
console.log([...new Set(warnings)].join('\n') || '경고 없음');
