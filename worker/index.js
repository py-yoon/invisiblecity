// invisiblecity.co.kr Worker: 블로그 정적 파일은 그대로 내보내고(ASSETS),
// /nimby/·/factory/·/architect/ 아래 요청만 각 앱으로 넘겨 같은 도메인에서 보이게 한다.
const APPS = [
  // SPIRE(/spire)는 2026-11-16부터 이 Worker 를 거치지 않는다: worlds-tallest Worker 의 경로 라우트가 정적 파일로 바로 내보낸다.
  // 기피시설 지도(ghmun-nimby-map)는 루트에서 도는 정적 사이트라 /nimby 를 떼고 넘긴다.
  // 2026-11-16 Vercel 정지로 Cloudflare Worker(ghmun-nimby-map)로 옮겼다. binding 이 있으면 origin 은 주소 계산용 자리표시다.
  { prefix: '/nimby', origin: 'https://ghmun-nimby-map.internal', binding: 'NIMBY', keepPrefix: false },
  // 공장용지 지도(factory-map)도 루트에서 도는 정적 사이트다.
  { prefix: '/factory', origin: 'https://factory-map.internal', binding: 'FACTORY', keepPrefix: false },
  // 건축, 걷다(archi2)는 Next.js basePath가 /architect 라서 경로를 그대로 넘긴다.
  { prefix: '/architect', origin: 'https://archi2-lovat.vercel.app', keepPrefix: true },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 옛 주소 nimby.invisiblecity.co.kr → /nimby/ (경로는 그대로 붙인다)
    if (url.hostname === 'nimby.invisiblecity.co.kr') {
      return Response.redirect(`https://invisiblecity.co.kr/nimby${url.pathname}${url.search}`, 308);
    }
    // http → https, www → apex 를 한 번에 301로 맞춘다(검색엔진이 주소 하나만 보게).
    if (url.protocol === 'http:' || url.hostname === 'www.invisiblecity.co.kr') {
      return Response.redirect(`https://invisiblecity.co.kr${url.pathname}${url.search}`, 301);
    }
    // RETRACK은 서브도메인에서 돈다. 다른 사이트처럼 /retrack 으로 들어와도 찾아가게 한다.
    if (url.pathname === '/retrack' || url.pathname.startsWith('/retrack/')) {
      return Response.redirect(`https://retrack.invisiblecity.co.kr${url.pathname.slice('/retrack'.length) || '/'}${url.search}`, 301);
    }
    const app = APPS.find((a) => url.pathname === a.prefix || url.pathname.startsWith(a.prefix + '/'));
    if (!app) return env.ASSETS.fetch(request);

    // 정적 사이트는 /nimby → /nimby/ 로 맞춰야 상대 경로(data/…)가 제대로 풀린다.
    if (!app.keepPrefix && url.pathname === app.prefix) {
      return Response.redirect(`${url.origin}${app.prefix}/${url.search}`, 301);
    }
    let path = app.keepPrefix ? url.pathname : url.pathname.slice(app.prefix.length);
    // 정적 Worker 는 주소를 Vercel 때와 같게 두려고(.html 그대로) html_handling 을 꺼 두었다. 폴더 주소만 여기서 index.html 로 잇는다.
    if (app.binding && path.endsWith('/')) path += 'index.html';
    const upstream = new URL(path + url.search, app.origin);

    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    // binding 이 있는 앱은 같은 계정의 다른 Worker 를 서비스 바인딩으로 직접 부른다(wrangler.jsonc services).
    const res = await (app.binding ? env[app.binding] : globalThis).fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    // Vercel이 돌려주는 리다이렉트 주소를 블로그 도메인 기준으로 바꾼다.
    const location = res.headers.get('location');
    if (!location) return res;
    const target = new URL(location, app.origin);
    if (target.origin !== app.origin) return res;
    const out = new Response(res.body, res);
    out.headers.set('location', `${url.origin}${app.keepPrefix ? '' : app.prefix}${target.pathname}${target.search}`);
    return out;
  },
};
