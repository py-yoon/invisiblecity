// 앱 데이터로 정기 글(마크다운)을 만든다. 만든 글은 src/content/posts/ 에 쓰고, 읽어 본 뒤 커밋한다.
//
//   node scripts/digest.mjs factory 2026-11-01   공장용지 지도: 기준일에 접수 중인 산업용지·자족용지 공고
//   node scripts/digest.mjs retrack 2026-10      RETRACK: 그 달에 진행 단계가 바뀐 서울 정비사업
//   node scripts/digest.mjs retrack-week 2026-11-02  RETRACK: 기준일까지 7일 동안 단계가 바뀐 정비사업(월요일 글)
//   node scripts/digest.mjs gu next              RETRACK 자치구 정비사업 현황: 아직 안 쓴 구 중 사업 많은 순(또는 구 이름)
//   node scripts/digest.mjs apt next              RETRACK 구별 대장아파트: 이 데이터로 아직 안 쓴 권역(또는 권역 이름)
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

// DRAFT=1 이면 초안(draft: true)으로 쓴다. 운영 사이트에는 안 나오고 pnpm dev 에서만 보인다.
const draft = process.env.DRAFT === '1';
function writePost({ slug, title, categories, tags, description, body }) {
  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${JSON.stringify(slug)}`,
    `date: ${nowKst()}`,
    ...(draft ? ['draft: true'] : []),
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
  const [y, mo] = month.split('-');
  stageDigest({ from: `${month}-01`, to: `${month}-31`, label: `${y}년 ${+mo}월`, span: '한 달 동안', slug: `서울-재개발-재건축-단계-변화-${month}` });
}

// 주간판: 기준일까지 7일(기준일 포함). 월요일 글은 지난 화~월 수집분을 다룬다.
function retrackWeek(ref) {
  const from = new Date(Date.parse(ref) - 6 * 864e5).toISOString().slice(0, 10);
  stageDigest({ from, to: ref, label: `${md(from)}~${md(ref)}`, span: '한 주 동안', slug: `서울-재개발-재건축-단계-변화-주간-${ref}`, weekly: true });
}

function stageDigest({ from, to, label, span, slug, weekly = false }) {
  const W = (f) => readJson(path.join(RETRACK_DIR, 'web/data', f));
  const projects = new Map(W('projects.json').map((p) => [p.slug, p]));
  const meta = W('meta.json');
  const items = W('updates.json')
    .filter((x) => x.kind === 'stage' && x.date >= from && x.date <= to)
    .sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.name.localeCompare(b.name, 'ko'));
  if (!items.length) throw new Error(`${label}에 단계가 바뀐 사업이 없다`);
  const nProj = new Set(items.map((x) => x.slug)).size;
  const last = items.reduce((m, x) => (x.date > m ? x.date : m), '');
  const link = (x) => `[${x.name}](https://retrack.invisiblecity.co.kr/project/${encodeURIComponent(x.slug)}/)`;
  const units = (x) => { const u = projects.get(x.slug)?.totalUnits; return u ? num(u) : ''; };

  const grouped = GROUPS.map(([name]) => [name, []]);
  for (const x of items) grouped[GROUPS.findIndex(([, f]) => f(x.summary))][1].push(x);
  const nonEmpty = grouped.filter(([, xs]) => xs.length);

  const byGu = Object.entries([...new Map(items.map((x) => [x.slug, x])).values()].reduce((m, x) => ((m[x.gu] = (m[x.gu] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));

  const parts = [];
  parts.push(`${label} ${span} 서울 재개발·재건축 정비사업 가운데 진행 단계가 바뀐 사업은 **${nProj}곳**, 기록된 단계 변화는 ${items.length}건이다. [RETRACK](https://retrack.invisiblecity.co.kr/)이 매주 서울시 정비사업 정보몽땅을 읽어 단계 변화를 기록한 결과다(${md(last)} 수집분까지).`);
  parts.push(table(['변화', '건'], nonEmpty.map(([n, xs]) => [n, xs.length])));
  parts.push(`자치구별로는 ${byGu.slice(0, 5).map(([g, c]) => `${g} ${c}곳`).join(', ')} 순으로 많았다.`);
  for (const [name, xs] of nonEmpty) {
    parts.push(`## ${name} ${xs.length}건\n\n` + table(['사업', '자치구', '단계 변화', '계획 세대수', '확인일'],
      xs.map((x) => [link(x), x.gu, x.summary, units(x), md(x.date)])));
  }
  parts.push(`## 읽는 법\n\n확인일은 RETRACK이 바뀐 단계를 처음 읽은 날이라 실제 인가·승인일과 며칠 차이가 날 수 있다. 한 사업이 한 달에 두 번 이상 바뀌거나 변경 인가를 받으면 여러 줄로 나온다. 계획 세대수는 정비계획에 적힌 값이고 비어 있으면 아직 공개되지 않은 것이다. 사업별 추진 경과는 각 사업 이름을 누르면 RETRACK에서 볼 수 있다.\n\n## 출처\n\n- [서울시 정비사업 정보몽땅](https://cleanup.seoul.go.kr) (데이터 ${ymd(meta.dataDate)} 기준)`);

  const top = nonEmpty[0];
  writePost({
    slug,
    title: `${weekly ? `이번 주(${label})` : label} 서울 재개발·재건축 진행 단계가 바뀐 ${nProj}곳`,
    categories: ['도시정비사업'],
    tags: ['재개발', '재건축', '정비사업', '서울', '진행단계', '조합설립인가'],
    description: `${label} 서울 재개발·재건축 정비사업 ${nProj}곳의 진행 단계가 바뀌었다(${items.length}건). ${top[0]} ${top[1].length}건을 비롯해 자치구별 사업 이름, 단계 변화, 계획 세대수를 정리했다.`,
    body: parts.join('\n\n'),
  });
}

// ── RETRACK 구별 대장아파트: 권역 하나씩 돌아가며 ─────────────────────────
// 서울시 생활권 5개 권역. 격주 수요일마다 하나씩 돌고, 다섯 번이면 한 바퀴다.
const REGIONS = {
  동남권: ['서초구', '강남구', '송파구', '강동구'],
  도심권: ['종로구', '중구', '용산구'],
  서남권: ['양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구'],
  서북권: ['은평구', '서대문구', '마포구'],
  동북권: ['성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구'],
};
// 앞 낱말 끝소리에 맞춰 조사를 고른다(받침 있으면 a, 없으면 b). 괄호·숫자·영문 끝도 읽는 소리로 본다.
const jong = (w) => {
  const t = w.replace(/[)\]\s]+$/, '');
  const c = t.at(-1) ?? '';
  const code = c.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) return code % 28;
  if (/\d/.test(c)) return '0136780'.includes(c) ? (c === '1' || c === '7' || c === '8' ? 8 : 1) : 0;
  return /[LMNRlmnr]/.test(c) ? 8 : /[a-zA-Z]/.test(c) ? 0 : 0;
};
const josa = (w, a, b) => w + (jong(w) ? a : b);
const ro = (w) => w + (jong(w) && jong(w) !== 8 ? '으로' : '로');
const eok = (won) => {
  const e = won / 1e8;
  return e >= 10 ? `${e.toFixed(1).replace(/\.0$/, '')}억` : `${e.toFixed(2).replace(/0$/, '').replace(/\.0?$/, '')}억`;
};

// K-apt 단지명 끝의 동 목록(현대14차(203,204,205,206동), 옥수파크힐스101동~116동)은 떼고 보여 준다.
const aptName = (n) => n.replace(/\(?[\d,~·\s]+동(~\d+동)?\)?$/, '').trim() || n;

function apt(arg) {
  const doc = readJson(path.join(RETRACK_DIR, 'web/data/apt-leaders.json'));
  // next: 이 데이터 기간(to 의 연월)으로 아직 안 쓴 권역을 REGIONS 순서대로. 다 썼으면 오류(새 데이터를 기다린다).
  const tag = doc.window.to.slice(0, 7);
  const files = fs.readdirSync(POSTS);
  const region = arg !== 'next' ? arg
    : Object.keys(REGIONS).find((r) => !files.includes(`서울-${r}-대장아파트-${tag}.md`))
      ?? (() => { throw new Error(`${tag} 데이터로 다섯 권역을 다 썼다. RETRACK 대장아파트 데이터가 갱신될 때까지 기다린다`); })();
  const gus = REGIONS[region];
  if (!gus) throw new Error(`권역: ${Object.keys(REGIONS).join(', ')}`);
  const all = doc.gus;
  const mine = gus.map((g) => all.find((x) => x.gu === g)).map((g) => ({ ...g, leaders: g.leaders.map((l) => ({ ...l, name: aptName(l.name) })), top: g.top && { ...g.top, name: aptName(g.top.name) } }));
  const RT = 'https://retrack.invisiblecity.co.kr';
  const guLink = (g) => `[${g}](${RT}/gu/${encodeURIComponent(g)}/)`;
  const { from, to } = doc.window;
  const span = `${from.slice(0, 4)}년 ${+from.slice(5, 7)}월~${+to.slice(5, 7)}월`;

  // 서울 25개 구를 1위 단지 중위가로 줄 세운 순위(권역 안 구가 서울에서 몇 번째인지).
  const seoulRank = [...all].sort((a, b) => b.leaders[0].median - a.leaders[0].median).map((x) => x.gu);
  const firsts = mine.map((g) => ({ gu: g.gu, ...g.leaders[0] })).sort((a, b) => b.median - a.median);
  const hi = firsts[0], lo = firsts.at(-1);
  const new10 = mine.flatMap((g) => g.leaders).filter((l) => l.built >= +to.slice(0, 4) - 10).length;
  const total = mine.reduce((n, g) => n + g.leaders.length, 0);
  const busiest = mine.flatMap((g) => g.leaders.map((l) => ({ gu: g.gu, ...l }))).sort((a, b) => b.n - a.n)[0];
  const trades = mine.reduce((n, g) => n + g.trades84, 0);

  const parts = [];
  parts.push(`서울 ${region}(${gus.join('·')}) 각 구에서 국민평형(전용 ${doc.area[0]}~${doc.area[1]}㎡)이 가장 비싸게 거래된 아파트 1~5위를 정리했다. ${span} 신고된 중개거래 실거래가(직거래·해제 제외)로 단지별 **중위가**를 내고, 거래가 ${doc.minN}건 이상인 단지만 순위에 올렸다. 이 기간 ${region} ${gus.length}개 구의 국민평형 거래는 ${num(trades)}건이다.`);
  const tied = firsts.filter((f) => eok(f.median) === eok(hi.median));
  const head = tied.length > 1
    ? `${region}에서 구별 1위가 가장 높은 곳은 ${tied.map((f, i) => i < tied.length - 1 ? `${f.gu} **${f.name}**${josa(f.name, '과', '와').slice(f.name.length)}` : `${f.gu} **${f.name}**${josa(f.name, '이다', '다').slice(f.name.length)}`).join(' ')}. 둘 다 중위가 ${eok(hi.median)}이다`
    : `${region}에서 구별 1위가 가장 높은 곳은 ${hi.gu} **${hi.name}**(${eok(hi.median)})이다`;
  parts.push(`${head}. 가장 낮은 곳은 ${lo.gu} ${lo.name}(${eok(lo.median)})${ro(eok(lo.median)).slice(eok(lo.median).length)}, 같은 권역 안에서도 ${(hi.median / lo.median).toFixed(1)}배 차이가 난다. 권역 안 ${total}개 순위 단지 가운데 준공 10년 이내 단지는 ${new10}곳이다. 거래가 가장 많았던 순위 단지는 ${busiest.n}건이 신고된 ${busiest.gu} ${josa(busiest.name, '이다', '다')}.`);
  parts.push(table(['구', '1위 단지', '중위가', '서울 25개 구 중'], firsts.map((f) => [f.gu, f.name, eok(f.median), `${seoulRank.indexOf(f.gu) + 1}위`])));
  for (const g of mine) {
    const rows = g.leaders.map((l) => [l.rank, l.name, l.dong, l.built, `${l.n}건`, eok(l.median), `${eok(l.min)}~${eok(l.max)}`, `${md(l.latest.date)} ${eok(l.latest.price)}(${l.latest.floor}층)`]);
    const t = g.top;
    parts.push(`## ${g.gu}\n\n국민평형 거래 ${num(g.trades84)}건(${g.complexes84}개 단지).${g.relaxed ? ` 거래가 적어 ${doc.minN}건 기준을 낮춰 순위를 냈다.` : ''}\n\n` +
      table(['순위', '단지', '동', '준공', '거래', '중위가', '거래 범위', '최근 거래'], rows) +
      (t ? `\n\n면적과 상관없이 이 기간 ${g.gu}에서 가장 비싼 거래는 ${t.dong} ${t.name} 전용 ${t.m2}㎡ ${eok(t.price)}(${md(t.date)}, ${t.floor}층)이다.` : ''));
  }
  parts.push(`## 읽는 법\n\n순위는 평균이나 최고가가 아니라 중위가 기준이다. 한두 건의 이상 거래에 흔들리지 않게 하려는 것이다. 거래가 적은 단지는 빠지므로, 비싸도 이 기간 손바뀜이 ${doc.minN}건 미만이면 순위에 없다. 같은 단지가 단지별로 나뉘어 신고되면 따로 집계된다. 지도와 다른 권역 순위는 [RETRACK 구별 대장아파트](${RT}/apt/leaders/)에서 볼 수 있고, 구 이름을 누르면 그 구의 정비사업 현황으로 간다: ${gus.map(guLink).join(', ')}.\n\n## 출처\n\n- 국토교통부 아파트 매매 실거래가 (${ymd(from)}~${ymd(to)} 신고분, ${ymd(doc.asOf)} 집계)\n- 공동주택관리정보시스템(K-apt) 단지 정보`);

  writePost({
    slug: `서울-${region}-대장아파트-${to.slice(0, 7)}`,
    title: `서울 ${region} 구별 대장아파트 순위: ${hi.gu} ${hi.name} ${eok(hi.median)} (${span} 국민평형 실거래)`,
    categories: ['부동산'],
    tags: ['대장아파트', '아파트', '실거래가', '국민평형', region, ...gus],
    description: `${span} 국민평형(84㎡) 실거래 중위가로 본 서울 ${region} ${gus.join('·')} 구별 대장아파트 1~5위. 1위는 ${firsts.map((f) => `${f.gu} ${f.name}`).join(', ')}.`,
    body: parts.join('\n\n'),
  });
}

// ── RETRACK 자치구별 정비사업 현황: 아직 안 쓴 구를 사업 수 많은 순으로 하나씩 ─────────
const PHASES = [
  ['구상·구역 지정', ['unknown', 'safety-check', 'plan', 'designated']],
  ['추진위·조합 설립', ['member-recruit', 'committee', 'operator', 'union']],
  ['사업시행·관리처분 인가', ['review', 'impl-approved', 'mgmt-approved']],
  ['분양·공사 중', ['presale', 'construction']],
  ['완료(준공·이전고시·해산)', ['completed', 'transfer', 'dissolved']],
];
const shortName = (n) => {
  let t = n.replace(/^\d+\.\s*/, '').replace(/\s*도시환경정비사업/g, ' ').replace(/\s*(주택|도시환경)?(재개발|재건축)정비사업(\s*사업시행자)?/g, ' ').replace(/\s*\((신탁방식|사업시행자)?[^()]*신탁\)$/, '').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(/\s*(조합설립|조합|추진위원회|정비사업|사업|도시환경|도시정비형|주택정비형|주택|재개발|재건축|정비)$/, '').trim(); }
  return t || n;
};

function guReport(arg) {
  const W = (f) => readJson(path.join(RETRACK_DIR, 'web/data', f));
  const P = W('projects.json');
  const meta = W('meta.json');
  const order = new Map(W('stages.json').map((x) => [x.code, x.order]));
  const counts = P.reduce((m, p) => ((m[p.gu] = (m[p.gu] ?? 0) + 1), m), {});
  const done = new Set(fs.readdirSync(POSTS).map((f) => f.match(/^서울-(.+구)-재개발-재건축-현황-/)?.[1]).filter(Boolean));
  const gu = arg === 'next'
    ? Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'ko')).find((g) => !done.has(g))
    : arg;
  if (!gu || !counts[gu]) throw new Error(arg === 'next' ? '25개 구를 다 썼다' : `없는 구: ${arg}`);

  const RT = 'https://retrack.invisiblecity.co.kr';
  const link = (p) => `[${shortName(p.name)}](${RT}/project/${encodeURIComponent(p.slug)}/)`;
  const mine = P.filter((p) => p.gu === gu);
  const rank = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).indexOf(gu) + 1;
  const phaseOf = (p) => PHASES.findIndex(([, cs]) => cs.includes(p.stage));
  const byPhase = PHASES.map(([n], i) => [n, mine.filter((p) => phaseOf(p) === i)]);
  const active = mine.filter((p) => phaseOf(p) < 4);
  const cats = Object.entries(mine.reduce((m, p) => ((m[p.category] = (m[p.category] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const units = (xs) => xs.reduce((n, p) => n + (p.totalUnits ?? 0), 0);
  const byStage = (a, b) => (order.get(b.stage) ?? 0) - (order.get(a.stage) ?? 0) || (b.totalUnits ?? 0) - (a.totalUnits ?? 0);
  const big = [...active].filter((p) => p.totalUnits).sort((a, b) => b.totalUnits - a.totalUnits).slice(0, 10);
  const builders = Object.entries(active.flatMap((p) => p.contractors).reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const since = new Date(Date.parse(meta.dataDate) - 183 * 864e5).toISOString().slice(0, 10);
  const recent = W('updates.json').filter((x) => x.gu === gu && x.kind === 'stage' && x.date >= since).sort((a, b) => b.date.localeCompare(a.date));
  const dongs = Object.entries(active.reduce((m, p) => ((m[p.dong] = (m[p.dong] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

  const parts = [];
  parts.push(`서울 ${gu}에는 RETRACK이 추적하는 재개발·재건축 정비사업이 **${mine.length}곳** 있다. 서울 25개 구 가운데 ${rank === 1 ? '가장 많다' : rank === 25 ? '가장 적다' : `${rank}번째로 많다`}. 이미 준공·해산까지 끝난 ${byPhase[4][1].length}곳을 빼면 지금 진행 중인 사업은 ${active.length}곳이고, 세대수가 공개된 사업의 계획 세대수를 더하면 ${num(units(active))}세대다. 유형별로는 ${cats.map(([c, n]) => `${c} ${n}곳`).join(', ')}이다(서울시 정비사업 정보몽땅, ${ymd(meta.dataDate)} 기준).`);
  parts.push(table(['단계', '사업 수', '계획 세대수'], byPhase.map(([n, xs]) => [n, `${xs.length}곳`, xs.length ? num(units(xs)) : ''])));
  if (dongs.length) parts.push(`진행 중인 사업이 많은 동은 ${dongs.slice(0, 5).map(([d, n]) => `${d}(${n}곳)`).join(', ')}이다.`);
  const late = [...byPhase[3][1], ...byPhase[2][1]].sort(byStage);
  if (late.length) parts.push(`## 인가를 받았거나 공사 중인 사업 ${late.length}곳\n\n관리처분인가 이후 사업은 이주·철거와 분양이 가까운 곳이다.\n\n` +
    table(['사업', '동', '유형', '단계', '계획 세대수', '시공사'], late.map((p) => [link(p), p.dong, p.category, p.stageLabel, p.totalUnits ? num(p.totalUnits) : '', p.contractors.join('·')])));
  if (big.length) parts.push(`## 계획 세대수가 큰 진행 중 사업\n\n` + table(['사업', '동', '단계', '계획 세대수'], big.map((p) => [link(p), p.dong, p.stageLabel, num(p.totalUnits)])));
  const early = [...byPhase[0][1], ...byPhase[1][1]].sort(byStage);
  if (early.length) parts.push(`## 초기 단계 사업 ${early.length}곳\n\n구역 지정 전후부터 조합 설립까지의 사업이다.\n\n` +
    table(['사업', '동', '유형', '단계', '계획 세대수'], early.map((p) => [link(p), p.dong, p.category, p.stageLabel, p.totalUnits ? num(p.totalUnits) : ''])));
  if (builders.length) parts.push(`## 시공사\n\n진행 중인 사업에서 시공사로 이름이 오른 곳은 ${builders.slice(0, 6).map(([c, n]) => `${c}(${n}곳)`).join(', ')} 순이다. 공동 시공은 각 회사에 한 번씩 셌다.`);
  if (recent.length) parts.push(`## 최근 6개월 단계 변화\n\n` + table(['사업', '단계 변화', '확인일'], recent.map((x) => [`[${shortName(x.name)}](${RT}/project/${encodeURIComponent(x.slug)}/)`, x.summary, ymd(x.date)])));
  parts.push(`## 읽는 법\n\n단계는 정비사업 정보몽땅에 올라온 최신 진행 단계다. 계획 세대수는 정비계획에 적힌 값이라 사업 중 바뀔 수 있고, 아직 공개되지 않은 사업은 비어 있다. 사업 이름을 누르면 RETRACK에서 추진 경과와 위치를 볼 수 있고, ${gu} 전체 지도는 [RETRACK ${gu}](${RT}/gu/${encodeURIComponent(gu)}/)에 있다. 같은 구 아파트 시세는 [구별 대장아파트](${RT}/apt/leaders/)에서 볼 수 있다.\n\n## 출처\n\n- [서울시 정비사업 정보몽땅](https://cleanup.seoul.go.kr) (${ymd(meta.dataDate)} 기준)`);

  writePost({
    slug: `서울-${gu}-재개발-재건축-현황-${meta.dataDate.slice(0, 7)}`,
    title: `${gu} 재개발·재건축 현황: 진행 중 ${active.length}곳, 계획 ${num(units(active))}세대 (${ymd(meta.dataDate).slice(0, -3).trim()} 기준)`.replace(/ \d+일 기준/, ' 기준'),
    categories: ['도시정비사업'],
    tags: ['재개발', '재건축', '정비사업', gu, '서울', '관리처분인가', '시공사'],
    description: `서울 ${gu} 재개발·재건축 정비사업 ${mine.length}곳(진행 중 ${active.length}곳)의 단계별 현황, 관리처분·공사 중 사업, 큰 사업, 시공사, 최근 단계 변화를 정리했다.`,
    body: parts.join('\n\n'),
  });
}

const [kind, arg] = process.argv.slice(2);
if (kind === 'factory' && /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '')) factory(arg);
else if (kind === 'retrack' && /^\d{4}-\d{2}$/.test(arg ?? '')) retrack(arg);
else if (kind === 'retrack-week' && /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '')) retrackWeek(arg);
else if (kind === 'apt' && arg) apt(arg);
else if (kind === 'gu' && arg) guReport(arg);
else {
  console.error('사용법: node scripts/digest.mjs factory YYYY-MM-DD | retrack YYYY-MM | retrack-week YYYY-MM-DD | apt 동남권 | gu 영등포구|next');
  process.exit(1);
}
