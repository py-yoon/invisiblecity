import type { APIContext } from 'astro';

// 미리보기 사이트는 전체 차단, 실제 도메인은 사이트맵만 알린다.
export function GET({ site }: APIContext) {
  const preview = site?.origin !== 'https://invisiblecity.co.kr';
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\nSitemap: ${new URL('spire/sitemap.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
