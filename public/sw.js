/* Service Worker เขียนมือ (ไม่พึ่งปลั๊กอิน) — ทำให้แอปเปิดได้ทันทีแม้ไม่มีเน็ตหรือเน็ตช้า
 *
 * กลยุทธ์
 *  - ตอน install: โหลดทุกหน้า + ไฟล์ JS/CSS ทุกไฟล์ของรุ่นนี้ (รวมส่วนที่โหลดทีหลัง เช่น แผนที่/PDF) และข้อมูลหน้า index.txt
 *    ลงแคชของรุ่นนี้ "ให้ครบทุกไฟล์" — ถ้าโหลดไม่ครบ (เน็ตหลุด) จะไม่ติดตั้ง รุ่นเดิมยังใช้ได้ตามปกติ แล้วค่อยลองใหม่รอบหน้า
 *  - หน้าเว็บ/ข้อมูลหน้า (index.txt) → cache-first จากแคชของรุ่นปัจจุบัน = เปิดแอปทันทีไม่ต้องรอเน็ต
 *    (อัปเดตมาทาง sw.js รุ่นใหม่ → ติดตั้งเบื้องหลัง → ใช้รุ่นใหม่เมื่อเปิดแอปครั้งถัดไป/แตะ "โหลดใหม่")
 *  - ไฟล์ /_next/static, /icons, /ocr → cache-first (ชื่อไฟล์มี hash / ไม่เปลี่ยน) ค้นในแคชรุ่นก่อนด้วย
 *    เพื่อให้หน้าที่ยังเปิดค้างจากรุ่นเก่าโหลดส่วนที่เหลือได้ (GitHub Pages ลบไฟล์รุ่นเก่าทิ้งแล้ว)
 *  - ไทล์แผนที่ OpenStreetMap → cache-first จำกัดจำนวนไม่เกิน TILE_LIMIT
 *  - CDN ของ Tesseract (กรณีไม่มีไฟล์ local) → stale-while-revalidate
 */
// VERSION และ PRECACHE ถูกเขียนทับตอน build โดย scripts/postbuild-sw.mjs (ไฟล์ใน out/sw.js)
const VERSION = 'dev';
const PRECACHE = []; // ไฟล์ทั้งหมดใน _next/static + ข้อมูลหน้า (index.txt) ที่ build ได้
// ชื่อแคชขึ้นต้นด้วย "travel-" ทั้งหมด — โดเมนเดียวกันอาจมีแอปอื่น (เช่น GitHub Pages ของบัญชีเดียวกัน)
// ห้ามลบ/แตะแคชที่ไม่ใช่ของแอปนี้
const PREFIX = 'travel-';
const APP_PREFIX = `${PREFIX}app-`;
const APP_CACHE = `${APP_PREFIX}${VERSION}`;
const TILE_CACHE = `${PREFIX}osm-tiles`;
const CDN_CACHE = `${PREFIX}cdn-ocr`;
const TILE_LIMIT = 700;

const ROUTES = ['./', './expenses/', './trip/', './scan/', './translate/', './summary/', './settings/', './trips/', './join/'];

/** ทำงานพร้อมกันทีละ n งาน (เร็วกว่าโหลดทีละไฟล์มาก แต่ไม่ยิงร้อยไฟล์พร้อมกัน) */
async function pool(items, n, fn) {
  const queue = [...items];
  const errors = [];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await fn(item);
        } catch (err) {
          errors.push(item);
        }
      }
    }),
  );
  return errors;
}

async function fetchFresh(url) {
  // cache: 'reload' = โหลดจากเซิร์ฟเวอร์จริง ไม่ใช้สำเนาเก่าในแคชเบราว์เซอร์ (GitHub Pages แคช 10 นาที)
  const res = await fetch(new Request(url, { cache: 'reload' }));
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      const assetUrls = new Set(PRECACHE.map((p) => new URL(p, self.registration.scope).href));
      const failedRoutes = await pool(ROUTES, 4, async (route) => {
        const res = await fetchFresh(route);
        await cache.put(new Request(route), res.clone());
        const html = await res.text();
        for (const m of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)) {
          assetUrls.add(new URL(m[1], self.registration.scope).href);
        }
      });
      const failedAssets = await pool([...assetUrls], 6, async (url) => {
        if (await cache.match(url)) return; // ติดตั้งรอบก่อนค้างไว้แล้ว
        await cache.put(url, await fetchFresh(url));
      });
      // dev (ไม่มีรายชื่อไฟล์) ไม่บังคับครบ · build จริงต้องครบ ไม่งั้นออฟไลน์จะเปิดบางหน้าไม่ได้
      if (PRECACHE.length && (failedRoutes.length || failedAssets.length)) {
        throw new Error(`precache ไม่ครบ ${failedRoutes.length + failedAssets.length} ไฟล์ — ใช้รุ่นเดิมไปก่อน`);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_CACHE, TILE_CACHE, CDN_CACHE]);
      // เก็บแคชรุ่นก่อนหน้าไว้ 1 รุ่น ให้หน้าที่ยังเปิดค้างจากรุ่นเก่าโหลดไฟล์ที่เหลือได้
      const oldApp = (await caches.keys()).filter((k) => k.startsWith(APP_PREFIX) && k !== APP_CACHE);
      if (oldApp.length) keep.add(oldApp[oldApp.length - 1]);
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && !keep.has(key)) await caches.delete(key); // ลบเฉพาะแคชรุ่นเก่าของแอปนี้
      }
      await self.clients.claim();
    })(),
  );
});

/** หาในแคชของแอปนี้: รุ่นปัจจุบันก่อน แล้วค่อยรุ่นก่อนหน้า (ไม่ค้นแคชของแอปอื่นในโดเมนเดียวกัน) */
async function matchApp(request, options) {
  const cur = await (await caches.open(APP_CACHE)).match(request, options);
  if (cur) return cur;
  const keys = (await caches.keys()).filter((k) => k.startsWith(APP_PREFIX) && k !== APP_CACHE).reverse();
  for (const k of keys) {
    const hit = await (await caches.open(k)).match(request, options);
    if (hit) return hit;
  }
  return undefined;
}

let tilePuts = 0;
async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const k of keys.slice(0, keys.length - limit)) await cache.delete(k);
}

async function tileFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) {
    await cache.put(request, res.clone());
    if (++tilePuts % 25 === 0) trimCache(TILE_CACHE, TILE_LIMIT); // ตัดของเก่าเป็นระยะ ไม่ต้องนับทุกไทล์
  }
  return res;
}

async function staticFirst(request) {
  const hit = await matchApp(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) (await caches.open(APP_CACHE)).put(request, res.clone());
  return res;
}

/** หน้าเว็บและข้อมูลหน้า (index.txt?_rsc=…) — ใช้ของในแคชทันที ไม่มีค่อยโหลดจากเน็ต */
async function pageFirst(request) {
  const url = new URL(request.url);
  const key = url.origin + url.pathname; // ตัด ?_rsc=… / ?source=… ออก ให้เก็บแค่ชุดเดียวต่อหน้า
  const hit = await matchApp(key, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok && !res.redirected) (await caches.open(APP_CACHE)).put(key, res.clone());
    return res;
  } catch (err) {
    const fallback = request.mode === 'navigate' ? await matchApp(new URL('./', self.registration.scope).href) : undefined;
    if (fallback) return fallback;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'tile.openstreetmap.org' || url.hostname === 'tile.openstreetmap.de') {
    event.respondWith(tileFirst(request));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'tessdata.projectnaptha.com' || url.hostname === 'unpkg.com') {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return; // API ภายนอก (แปลภาษา/ค้นหา/อากาศ) ปล่อยผ่าน
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return; // แอปอื่นในโดเมนเดียวกัน — ไม่ยุ่ง
  if (url.pathname.endsWith('/sw.js')) return;

  if (/\/(_next\/static|icons|ocr)\//.test(url.pathname)) {
    event.respondWith(staticFirst(request));
    return;
  }
  event.respondWith(pageFirst(request));
});
