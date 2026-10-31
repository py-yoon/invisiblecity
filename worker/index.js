// invisiblecity.co.kr Worker: 블로그 정적 파일은 그대로 내보내고(ASSETS),
// /spire/·/nimby/ 아래 요청만 각 Vercel 프로젝트로 넘겨 같은 도메인에서 보이게 한다.
const APPS = [
  // SPIRE(worlds-tallest)는 Next.js basePath가 /spire 라서 경로를 그대로 넘긴다.
  { prefix: '/spire', origin: 'https://worlds-tallest.vercel.app', keepPrefix: true },
  // 기피시설 지도(ghmun-nimby-map)는 루트에서 도는 정적 사이트라 /nimby 를 떼고 넘긴다.
  { prefix: '/nimby', origin: 'https://ghmun-nimby-map.vercel.app', keepPrefix: false },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const app = APPS.find((a) => url.pathname === a.prefix || url.pathname.startsWith(a.prefix + '/'));
    if (!app) return env.ASSETS.fetch(request);

    // 정적 사이트는 /nimby → /nimby/ 로 맞춰야 상대 경로(data/…)가 제대로 풀린다.
    if (!app.keepPrefix && url.pathname === app.prefix) {
      return Response.redirect(`${url.origin}${app.prefix}/${url.search}`, 301);
    }
    const path = app.keepPrefix ? url.pathname : url.pathname.slice(app.prefix.length);
    const upstream = new URL(path + url.search, app.origin);

    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    const res = await fetch(upstream, {
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
