// 빌드 뒤에 dist/uploads의 PNG·JPG를 WebP로 만들고, HTML의 <img>를 <picture>로 바꾼다.
// 원본은 그대로 두어 WebP를 못 읽는 브라우저와 og:image에 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIST = 'dist';
const MAX_WIDTH = 1600;

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}

// 1. WebP 만들기 (원본보다 작을 때만)
const meta = new Map(); // 'uploads/…/a.png' → { width, height, webp }
let before = 0, after = 0;
for (const file of walk(path.join(DIST, 'uploads'), (p) => /\.(png|jpe?g)$/i.test(p))) {
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const webpPath = file.replace(/\.(png|jpe?g)$/i, '.webp');
  const buf = await img.resize({ width: Math.min(width, MAX_WIDTH), withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const size = fs.statSync(file).size;
  const useWebp = buf.length < size * 0.9;
  if (useWebp) fs.writeFileSync(webpPath, buf);
  meta.set(rel, { width, height, webp: useWebp });
  before += size;
  after += useWebp ? buf.length : size;
}

// 2. HTML의 본문 이미지에 크기·지연 로딩·WebP 소스를 붙인다
let count = 0;
for (const file of walk(DIST, (p) => p.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  let first = true;
  const out = html.replace(/<img\s([^>]*?)src="([^"]*\/(uploads\/[^"]+\.(?:png|jpe?g)))"([^>]*)>/gi, (m, pre, src, rel, post) => {
    const info = meta.get(decodeURIComponent(rel));
    if (!info) return m;
    count++;
    let attrs = `${pre}src="${src}"${post}`.replace(/\s(width|height|loading|decoding)="[^"]*"/g, '');
    attrs += ` width="${info.width}" height="${info.height}" decoding="async"${first ? '' : ' loading="lazy"'}`;
    first = false;
    const img = `<img ${attrs.trim()}>`;
    return info.webp ? `<picture><source srcset="${src.replace(/\.(png|jpe?g)$/i, '.webp')}" type="image/webp">${img}</picture>` : img;
  });
  if (out !== html) fs.writeFileSync(file, out);
}
console.log(`이미지 ${meta.size}개: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB, HTML 이미지 태그 ${count}곳`);
