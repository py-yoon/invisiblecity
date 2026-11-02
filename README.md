# invisiblecity

보이지 않는 도시연구소(invisiblecity.co.kr)를 워드프레스에서 Astro 정적 사이트로 옮긴 저장소.

- 글: `src/content/posts/*.md` (프런트매터 + 마크다운)
- 도구·지도 페이지: `src/content/pages/*.html` (원본 HTML 그대로)
- 이미지: `public/uploads/` (워드프레스 경로 유지)
- 글쓰기: `/admin/` (Sveltia CMS, GitHub 로그인 → main에 커밋 → 자동 배포)

## 명령

```sh
pnpm dev                 # 로컬 미리보기
pnpm build               # dist/ 생성 + 이미지 WebP 변환 + 검색 색인
pnpm convert [백업폴더]   # 워드프레스 백업에서 글·이미지 다시 생성 (기존 글을 덮어씀)
```

배포: Cloudflare Workers(`wrangler.jsonc`)가 main에 푸시될 때마다 `pnpm build` 후 dist/를 올린다.
invisiblecity.co.kr·www가 이 Worker에 연결되어 있다. `_redirects`가 옛 워드프레스 주소를 넘겨준다.
(2026-10-31까지 쓰던 GitHub Pages 미리보기는 BASE=/invisiblecity/ 로 빌드했고, 지금은 껐다.)

## 정기 글 초안 자동 작성 (월·수·금)

`scripts/weekly-post.sh` 가 매일 22:00(맥 launchd, `kr.co.invisiblecity.posts`)에 한 번 돌아 그날이 월·수·금이면 `draft: true` 초안을 커밋·푸시한다. 그날 못 돌았으면(맥이 꺼져 있었으면) 다음 날 22:00에 보충하고, 이틀 넘게 밀린 슬롯은 건너뛰며 알림만 보낸다. 초안은 운영 사이트에 안 나오니 읽어 보고 `draft: true` 줄을 지워 게시한다.

- 월: 매달 첫 월요일 지난달 재개발 단계 변화 / 그 밖의 월요일 자치구 정비사업 현황(`gu next`)
- 수: 홀수 주 서울 대장아파트(`apt next`) / 짝수 주 산업용지 공급 공고
- 금: 홀수 주 국내 건축가 / 짝수 주 해외 건축가 (`claude -p`가 조사해 작성, 끝에 '작성 메모' 주석으로 확인 못 한 사실을 남김)
- 글 제목에는 콜론(:)을 쓰지 않고 ` - `를 쓴다(검증 단계에서 막는다).
- launchd는 ~/Documents에 접근 못 하므로(macOS TCC) 전용 복제본에서 돈다:
  `git clone https://github.com/py-yoon/invisiblecity ~/.invisiblecity-sync`, `git clone --depth 1 https://github.com/py-yoon/retrack ~/.retrack-sync`, `git clone --depth 1 https://github.com/py-yoon/archi2 ~/.archi2-sync` (factory-map은 `~/.factory-map-sync` 공용) 후
  `cp scripts/invisiblecity-posts.plist ~/Library/LaunchAgents/kr.co.invisiblecity.posts.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/kr.co.invisiblecity.posts.plist`. 로그 ~/Library/Logs/invisiblecity-posts.log
- 시험: `DRY=1 FORCE_SLOT=mon|wed|fri scripts/weekly-post.sh` (커밋·푸시 안 함)
