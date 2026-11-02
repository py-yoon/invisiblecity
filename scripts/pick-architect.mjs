// 금요일 건축가 글 대상 고르기. node scripts/pick-architect.mjs <domestic|international> [archi2 저장소 경로]
// 이미 글이 있는 건축가(제목·태그에 한글 이름이나 영문 이름이 들어간 글)는 건너뛴다. 출력: JSON 한 줄(없으면 종료코드 3).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const origin = process.argv[2];
const archi = process.argv[3] ?? process.env.ARCHI_DIR ?? path.resolve(ROOT, '../../Final Virsion/ghmun-archi2');
if (!['domestic', 'international'].includes(origin)) { console.error('사용법: pick-architect.mjs domestic|international [archi2경로]'); process.exit(2); }

const src = fs.readFileSync(path.join(archi, 'src/data/architects.ts'), 'utf8');
const body = src.slice(src.indexOf('= [') + 2, src.lastIndexOf('];') + 1);
const list = new Function(`return ${body}`)();

const posts = fs.readdirSync(path.join(ROOT, 'src/content/posts')).filter((f) => f.endsWith('.md'))
  .map((f) => fs.readFileSync(path.join(ROOT, 'src/content/posts', f), 'utf8').split('\n---')[0].toLowerCase()).join('\n');
const norm = (s) => s.toLowerCase().replace(/[\s.\-·]/g, '');
const hay = norm(posts);
const bare = (n) => n.replace(/\(.*?\)/g, '');   // '이타미 준 (유동룡)' → '이타미 준'
const written = (a) => [a.name, a.nameEn].filter(Boolean).map(bare).some((n) => norm(n).length >= 2 && hay.includes(norm(n)));

const next = list.filter((a) => a.origin === origin).find((a) => !written(a));
if (!next) { console.error(`${origin}: 아직 안 쓴 건축가가 없다`); process.exit(3); }
console.log(JSON.stringify({ id: next.id, name: next.name, nameEn: next.nameEn, country: next.country }));
