// 앱 데이터로 정기 글(마크다운)을 만든다. 만든 글은 src/content/posts/ 에 쓰고, 읽어 본 뒤 커밋한다.
//
//   node scripts/digest.mjs factory 2026-11-01   공장용지 지도: 기준일에 접수 중인 산업용지·자족용지 공고
//   node scripts/digest.mjs retrack 2026-10      RETRACK: 그 달에 진행 단계가 바뀐 서울 정비사업
//
// 데이터는 옆 저장소에서 읽는다(경로는 환경 변수로 바꿀 수 있다).
//   FACTORY_DIR (기본 ../factory-map), RETRACK_DIR (기본 ../seoul-redev)
// 두 앱 모두 매주 데이터를 갱신하니, 글을 만들기 전에 해당 저장소를 pull 해 둔다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FACTORY_DIR = process.env.FACTORY_DIR ?? path.resolve(ROOT, '../factory-map');
const RETRACK_DIR = process.env.RETRACK_DIR ?? path.resolve(ROOT, '../seoul-redev');
const POSTS = path.join(ROOT, 'src/content/posts');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const num = (n) => Math.round(n).toLocaleString('ko-KR');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const row = (cols) => `| ${cols.map(cell).join(' | ')} |`;
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const md = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const ymd = (d) => `${d.slice(0, 4)}년 ${md(d)}`;
const nowKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00';

function writePost({ slug, title, categories, tags, description, body }) {
  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${JSON.stringify(slug)}`,
    `date: ${nowKst()}`,
    `categories: ${JSON.stringify(categories)}`,
    `tags: ${JSON.stringify(tags)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
  ].join('\n');
  const file = path.join(POSTS, `${slug}.md`);
  fs.writeFileSync(file, `${fm}\n${body.trim()}\n`);
  console.log(`썼다: ${path.relative(ROOT, file)}`);
}

// ── 공장용지 지도: 기준일에 접수 중인 공고 ─────────────────────────────
function factory(ref) {
  const D = (f) => readJson(path.join(FACTORY_DIR, 'data', f));
  const danji = new Map(D('danji.json').items.map((x) => [x.cd, x]));
  const notices = D('notices.json');
  const lh = D('lh-industry.json');
  const citydev = D('citydev.json');
  const updated = notices.updated;

  // 지자체·관리기관 매각/분양 공고: 접수 마감이 기준일 이후인 것. 같은 필지 재공고는 가장 최근 것만.
  // 최근 60일 안에 나온 공고와, 몇 년째 열려 있는 상시 공급(선착순·수의계약) 공고를 나눠 보여 준다.
  const seen = new Set();
  const live = notices.items
    .filter((x) => (x.edate ?? x.date) >= ref)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((x) => { const k = `${x.cd}|${x.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const cutoff = new Date(Date.parse(ref) - 60 * 864e5).toISOString().slice(0, 10);
  const open = live.filter((x) => x.date >= cutoff).sort((a, b) => (a.edate ?? '').localeCompare(b.edate ?? ''));
  const standingSeen = new Set();
  const standing = live.filter((x) => x.date < cutoff)
    .filter((x) => (standingSeen.has(x.cd) ? false : (standingSeen.add(x.cd), true)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const lhOpen = lh.items.filter((x) => x.status === '공고중' && x.due >= ref);
  const cdOpen = citydev.items.filter((x) => x.status === '공고중' && x.due >= ref)
    .sort((a, b) => a.due.localeCompare(b.due));
  const total = open.length + lhOpen.length + cdOpen.length;
  const dd = (d) => (d.slice(0, 4) === ref.slice(0, 4) ? md(d) : ymd(d));

  const danjiLink = (cd, name) => (danji.has(cd) ? `[${name}](/factory/d/${cd}.html)` : name);
  const sido = (cd) => danji.get(cd)?.sido ?? '';

  const parts = [];
  parts.push(`${ymd(ref)} 기준으로 신청을 받고 있는 산업용지·자족시설용지 공급 공고는 **${total}건**이다. [공장용지 지도](/factory/)가 매주 모으는 공고 가운데 접수 마감이 지나지 않은 것만 골랐다(데이터 ${ymd(updated)} 갱신).`);

  parts.push(`## 산업단지 산업용지 매각·분양 공고 ${open.length}건\n\n지자체와 관리기관이 낸 공고다. 분양가는 공고에 적힌 ㎡당 가격이다.\n\n` + (open.length
    ? table(['단지', '시도', '구분', '접수', '면적(㎡)', '㎡당 가격(원)'], open.map((x) => [
        danjiLink(x.cd, x.nm) + (open.filter((o) => o.cd === x.cd).length > 1 ? ` ${x.title.match(/\(([^()]+)\)\s*$/)?.[1] ?? ''}` : ''), sido(x.cd), x.type, `${dd(x.sdate ?? x.date)} ~ ${dd(x.edate)}`, x.area ? num(x.area) : '', x.price ? num(x.price) : '',
      ]))
    : '접수 중인 공고가 없다.'));

  if (standing.length) parts.push(`## 상시 공급 중인 산업단지 ${standing.length}곳\n\n공고가 나온 지 두 달이 넘었지만 접수 기간이 아직 남은 공고다. 선착순이나 수의계약으로 남은 용지를 계속 받는 경우가 많다. 위 ${total}건에는 넣지 않았다.\n\n` +
    table(['단지', '시도', '공고일', '접수 마감', '면적(㎡)', '㎡당 가격(원)'], standing.map((x) => [
      danjiLink(x.cd, x.nm), sido(x.cd), ymd(x.date), ymd(x.edate), x.area ? num(x.area) : '', x.price ? num(x.price) : '',
    ])));

  parts.push(`## LH 산업시설용지 공급 공고 ${lhOpen.length}건\n\n` + (lhOpen.length
    ? table(['공고', '마감', '필지', '면적(㎡)', '㎡당 평균(원)'], lhOpen.map((x) => [
        `[${x.title}](${x.url})`, dd(x.due), x.parcels, num(x.area), x.price_m2 ? num(x.price_m2) : '',
      ]))
    : '접수 중인 공고가 없다.'));

  parts.push(`## LH 도시개발·택지지구 자족·지원시설용지 ${cdOpen.length}건\n\n공공주택지구와 도시개발사업지구 안에서 기업·업무 시설을 짓도록 내놓은 땅이다.\n\n` + (cdOpen.length
    ? table(['공고', '지역', '마감', '필지', '면적(㎡)', '㎡당 평균(원)'], cdOpen.map((x) => {
        const area = x.parcels.reduce((s, p) => s + (p.area ?? 0), 0);
        const priced = x.parcels.filter((p) => p.price && p.area);
        const avg = priced.length ? priced.reduce((s, p) => s + p.price, 0) / priced.reduce((s, p) => s + p.area, 0) : 0;
        return [`[${x.title}](${x.url})`, x.region, dd(x.due), x.parcels.length, num(area), avg ? num(avg) : ''];
      }))
    : '접수 중인 공고가 없다.'));

  parts.push(`## 출처\n\n- 산업단지 공고: 한국산업단지공단 [산업입지정보시스템](https://www.industryland.or.kr)\n- LH 공고: [LH 청약플러스](https://apply.lh.or.kr) 토지 공고\n\n가격과 일정은 정정 공고로 바뀔 수 있어 신청 전에는 공고 원문을 다시 본다. 지난 공고와 단지별 분양가 이력은 [공장용지 지도](/factory/)에서 볼 수 있다.`);

  writePost({
    slug: `산업용지-공급-공고-${ref}`,
    title: `산업용지 공급 공고 모음 (${ymd(ref)} 접수 중 ${total}건)`,
    categories: ['산업단지'],
    tags: ['공장용지', '산업단지', '산업용지', '분양', 'LH', '자족시설용지', '공고'],
    description: `${ymd(ref)} 기준 신청을 받고 있는 산업단지 산업용지 매각·분양 공고 ${open.length}건, LH 산업시설용지 ${lhOpen.length}건, LH 자족·지원시설용지 ${cdOpen.length}건의 접수 기간, 면적, ㎡당 가격을 정리했다.`,
    body: parts.join('\n\n'),
  });
}

// ── RETRACK: 한 달 동안 진행 단계가 바뀐 정비사업 ──────────────────────
const GROUPS = [
  ['조합 설립', (s) => /→ 조합설립인가$/.test(s)],
  ['추진위원회 승인', (s) => /→ 추진위원회승인$/.test(s)],
  ['정비구역 지정', (s) => /^정비계획수립 → 정비구역지정$/.test(s)],
  ['사업시행인가', (s) => /→ 사업시행인가$/.test(s)],
  ['착공·분양', (s) => /→ (착공|분양)$/.test(s)],
  ['준공', (s) => /→ 준공$/.test(s)],
  ['해산·청산', (s) => /→ 조합해산·청산$/.test(s)],
  ['그 밖의 변경', () => true],
];

function retrack(month) {
  const W = (f) => readJson(path.join(RETRACK_DIR, 'web/data', f));
  const projects = new Map(W('projects.json').map((p) => [p.slug, p]));
  const meta = W('meta.json');
  const items = W('updates.json')
    .filter((x) => x.kind === 'stage' && x.date.startsWith(month))
    .sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.name.localeCompare(b.name, 'ko'));
  if (!items.length) throw new Error(`${month}에 단계가 바뀐 사업이 없다`);
  const nProj = new Set(items.map((x) => x.slug)).size;
  const last = items.reduce((m, x) => (x.date > m ? x.date : m), '');
  const [y, mo] = month.split('-');
  const label = `${y}년 ${+mo}월`;
  const link = (x) => `[${x.name}](https://retrack.invisiblecity.co.kr/project/${encodeURIComponent(x.slug)}/)`;
  const units = (x) => { const u = projects.get(x.slug)?.totalUnits; return u ? num(u) : ''; };

  const grouped = GROUPS.map(([name]) => [name, []]);
  for (const x of items) grouped[GROUPS.findIndex(([, f]) => f(x.summary))][1].push(x);
  const nonEmpty = grouped.filter(([, xs]) => xs.length);

  const byGu = Object.entries([...new Map(items.map((x) => [x.slug, x])).values()].reduce((m, x) => ((m[x.gu] = (m[x.gu] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));

  const parts = [];
  parts.push(`${label} 한 달 동안 서울 재개발·재건축 정비사업 가운데 진행 단계가 바뀐 사업은 **${nProj}곳**, 기록된 단계 변화는 ${items.length}건이다. [RETRACK](https://retrack.invisiblecity.co.kr/)이 매주 서울시 정비사업 정보몽땅을 읽어 단계 변화를 기록한 결과다(${md(last)} 수집분까지).`);
  parts.push(table(['변화', '건'], nonEmpty.map(([n, xs]) => [n, xs.length])));
  parts.push(`자치구별로는 ${byGu.slice(0, 5).map(([g, c]) => `${g} ${c}곳`).join(', ')} 순으로 많았다.`);
  for (const [name, xs] of nonEmpty) {
    parts.push(`## ${name} ${xs.length}건\n\n` + table(['사업', '자치구', '단계 변화', '계획 세대수', '확인일'],
      xs.map((x) => [link(x), x.gu, x.summary, units(x), md(x.date)])));
  }
  parts.push(`## 읽는 법\n\n확인일은 RETRACK이 바뀐 단계를 처음 읽은 날이라 실제 인가·승인일과 며칠 차이가 날 수 있다. 한 사업이 한 달에 두 번 이상 바뀌거나 변경 인가를 받으면 여러 줄로 나온다. 계획 세대수는 정비계획에 적힌 값이고 비어 있으면 아직 공개되지 않은 것이다. 사업별 추진 경과는 각 사업 이름을 누르면 RETRACK에서 볼 수 있다.\n\n## 출처\n\n- [서울시 정비사업 정보몽땅](https://cleanup.seoul.go.kr) (데이터 ${ymd(meta.dataDate)} 기준)`);

  const top = nonEmpty[0];
  writePost({
    slug: `서울-재개발-재건축-단계-변화-${month}`,
    title: `${label} 서울 재개발·재건축 진행 단계가 바뀐 ${nProj}곳`,
    categories: ['도시정비사업'],
    tags: ['재개발', '재건축', '정비사업', '서울', '진행단계', '조합설립인가'],
    description: `${label} 서울 재개발·재건축 정비사업 ${nProj}곳의 진행 단계가 바뀌었다(${items.length}건). ${top[0]} ${top[1].length}건을 비롯해 자치구별 사업 이름, 단계 변화, 계획 세대수를 정리했다.`,
    body: parts.join('\n\n'),
  });
}

const [kind, arg] = process.argv.slice(2);
if (kind === 'factory' && /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '')) factory(arg);
else if (kind === 'retrack' && /^\d{4}-\d{2}$/.test(arg ?? '')) retrack(arg);
else {
  console.error('사용법: node scripts/digest.mjs factory YYYY-MM-DD | retrack YYYY-MM');
  process.exit(1);
}
