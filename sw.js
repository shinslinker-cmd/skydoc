/* 서비스 워커 — «앱으로 설치»와 «인터넷 없이도 열기»를 담당한다 (2026-09-04).
   ⭐ 전략이 중요하다:
     · 화면(HTML)은 **인터넷 먼저**(network-first) — 그래야 새로 배포한 판이 바로 뜬다.
       ⛔ 캐시 먼저로 하면 «고친 게 반영이 안 된다»가 된다(옛 편집기에서 실제로 겪은 사고).
       인터넷이 없으면 그때 캐시에서 꺼내 준다.
     · version.json 은 **늘 인터넷에서만** — 새 판 알림의 근거라 캐시하면 안 된다.
     · 아이콘·manifest 는 캐시 먼저(거의 안 바뀐다).
     · 글꼴(fonts.googleapis.com · fonts.gstatic.com · cdn.jsdelivr.net)은 **한 번 받아 두면 캐시**해
       인터넷이 없어도 같은 글꼴로 보이게 한다(쪽 나눔이 달라지지 않게).
   ⚠ 이 파일은 «따로 있는 파일»이어야 한다 — 단일 HTML 안에 넣을 수 없다(브라우저 규칙). */
const APP = 'skydoc-app-v1';     /* 화면·아이콘 */
const FONT = 'skydoc-font-v1';   /* 글꼴 */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(SHELL).catch(() => {});   /* 하나 실패해도 설치는 계속 */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [APP, FONT];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* 새 판 알림의 근거 — 캐시 금지 */
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  /* 글꼴 — 받아 둔 것이 있으면 그것, 없으면 받아서 넣어 둔다 */
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(FONT);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch (_) {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;   /* 그 밖 다른 곳은 건드리지 않는다 */

  /* 화면(HTML) — 인터넷 먼저, 없으면 캐시 */
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(APP);
        c.put('./index.html', res.clone());
        return res;
      } catch (_) {
        const c = await caches.open(APP);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  /* 나머지(아이콘·manifest) — 캐시 먼저 */
  e.respondWith((async () => {
    const c = await caches.open(APP);
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
