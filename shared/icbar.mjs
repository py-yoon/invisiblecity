// invisiblecity 공통 띠: 모든 앱(factory·retrack·architect·nimby·spire) 맨 위 28px 검은 띠.
// 왼쪽은 블로그 홈 링크, 오른쪽 SITES 메뉴는 여섯 사이트로 간다(underground는 정적 페이지라 public/underground/index.html에 직접 둠).
// 각 앱에는 이 파일이 만든 HTML·CSS를 그대로 복사해 둔다(앱마다 저장소가 달라서).
// 사이트를 추가하거나 이름을 바꾸면 여기를 고치고 `node shared/icbar.mjs` 출력으로 각 앱을 갱신한다.

export const SITES = [
  ['factory', 'FACTORY', '공장용지 지도', 'https://invisiblecity.co.kr/factory/'],
  ['retrack', 'RETRACK', '서울 재개발·재건축', 'https://retrack.invisiblecity.co.kr/'],
  ['architect', 'ARCHITECT', '건축, 걷다', 'https://invisiblecity.co.kr/architect'],
  ['nimby', 'NIMBY MAP', '전국 기피시설 지도', 'https://invisiblecity.co.kr/nimby/'],
  ['spire', 'SPIRE', '세계 최고층 빌딩 도감', 'https://invisiblecity.co.kr/spire/'],
  ['underground', 'UNDERGROUND', '땅 아래 대한민국', 'https://invisiblecity.co.kr/underground/'],
];

export const CSS = `.icbar{position:relative;z-index:10000;display:flex;align-items:center;gap:10px;height:28px;margin:0;padding:0 16px;box-sizing:border-box;background:#111;color:#fff;font:600 12px/1 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",Pretendard,"Malgun Gothic",sans-serif;letter-spacing:0;-webkit-font-smoothing:antialiased}
.icbar a{color:inherit;text-decoration:none}
.icbar-home{display:inline-flex;align-items:center;gap:7px;font-weight:800;letter-spacing:.06em}
.icbar-home::before{content:"";width:8px;height:8px;background:#ff8eb5}
.icbar-sub{color:#9a9a9a;font-weight:500}
.icbar-more{position:relative;margin-left:auto}
.icbar-more summary{display:block;cursor:pointer;list-style:none;padding:8px 0;font-weight:800;letter-spacing:.06em}
.icbar-more summary::-webkit-details-marker{display:none}
.icbar-more summary::after{content:" \\25BE"}
.icbar-more ul{position:absolute;right:-16px;top:28px;margin:0;padding:6px;list-style:none;background:#111;border-radius:0 0 10px 10px;min-width:236px;box-shadow:0 10px 28px rgba(0,0,0,.28)}
.icbar-more li{margin:0;padding:0}
.icbar-more li a{display:flex;align-items:baseline;gap:8px;padding:9px 10px;border-radius:6px;font-weight:500;line-height:1.2}
.icbar-more li a:hover,.icbar-more li a:focus-visible{background:#2a2a2a}
.icbar-more li b{min-width:78px;font-weight:800;letter-spacing:.04em}
.icbar-more li a[aria-current]{color:#ff8eb5}
@media (max-width:600px){.icbar-sub{display:none}}
@media print{.icbar{display:none}}`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** current: 지금 앱의 키(factory 등). 그 사이트 링크에 aria-current를 단다. */
export function html(current) {
  const items = SITES.map(([k, name, title, href]) =>
    `<li><a href="${href}"${k === current ? ' aria-current="page"' : ''}><b>${name}</b>${esc(title)}</a></li>`).join('');
  return `<nav class="icbar" aria-label="invisiblecity"><a class="icbar-home" href="https://invisiblecity.co.kr/">INVISIBLECITY</a><span class="icbar-sub">보이지 않는 도시연구소</span><details class="icbar-more"><summary>SITES</summary><ul>${items}</ul></details></nav>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.argv[2] ?? 'factory';
  console.log(`<style>${CSS}</style>\n${html(key)}`);
}
