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
