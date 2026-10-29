/* Service Worker เขียนมือ (ไม่พึ่งปลั๊กอิน) — ทำให้แอปเปิดได้แม้ไม่มีเน็ต
 *
 * กลยุทธ์
 *  - ตอน install: โหลดหน้าหลักทุกหน้า + ไฟล์ JS/CSS ทุกไฟล์ที่ build ได้ (รวมส่วนที่โหลดทีหลัง เช่น แผนที่/PDF)
 *    และข้อมูลหน้า index.txt ที่ใช้ตอนกดเปลี่ยนหน้า เก็บลงแคช (precache)
 *  - ไฟล์ /_next/static, /icons, /ocr  → cache-first (ชื่อไฟล์มี hash / ไม่เปลี่ยน)
 *  - หน้าเว็บ/ไฟล์อื่นของเรา          → network-first แล้วค่อย fallback แคช
 *  - ไทล์แผนที่ OpenStreetMap          → cache-first จำกัดจำนวนไม่เกิน TILE_LIMIT
 *  - CDN ของ Tesseract (กรณีไม่มีไฟล์ local) → stale-while-revalidate
 */
// VERSION และ PRECACHE ถูกเขียนทับตอน build โดย scripts/postbuild-sw.mjs (ไฟล์ใน out/sw.js)
const VERSION = 'dev';
const PRECACHE = []; // ไฟล์ทั้งหมดใน _next/static + ข้อมูลหน้า (index.txt) ที่ build ได้
// ชื่อแคชขึ้นต้นด้วย "travel-" ทั้งหมด — โดเมนเดียวกันอาจมีแอปอื่น (เช่น GitHub Pages ของบัญชีเดียวกัน)
// ห้ามลบ/แตะแคชที่ไม่ใช่ของแอปนี้
const PREFIX = 'travel-';
const APP_CACHE = `${PREFIX}app-${VERSION}`;
const TILE_CACHE = `${PREFIX}osm-tiles`;
const CDN_CACHE = `${PREFIX}cdn-ocr`;
const TILE_LIMIT = 700;

const ROUTES = ['./', './expenses/', './trip/', './scan/', './translate/', './summary/', './settings/', './trips/', './join/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      const assetUrls = new Set();
      for (const route of ROUTES) {
        try {
          const res = await fetch(new Request(route, { cache: 'reload' }));
          if (!res.ok) continue;
          await cache.put(new Request(route), res.clone());
          const html = await res.text();
          for (const m of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)) {
            assetUrls.add(new URL(m[1], self.registration.scope).href);
          }
        } catch (_) {
          /* ออฟไลน์ตอนติดตั้ง — ข้าม */
        }
      }
      for (const path of PRECACHE) assetUrls.add(new URL(path, self.registration.scope).href);
      for (const url of assetUrls) {
        try {
          // cache: 'reload' = โหลดจากเซิร์ฟเวอร์จริง ไม่ใช้สำเนาเก่าในแคชเบราว์เซอร์ (GitHub Pages แคช 10 นาที)
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (_) {}
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_CACHE, TILE_CACHE, CDN_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && !keep.has(key)) await caches.delete(key); // ลบเฉพาะแคชรุ่นเก่าของแอปนี้
      }
      await self.clients.claim();
    })(),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const k of keys.slice(0, keys.length - limit)) await cache.delete(k);
}

async function cacheFirst(request, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) {
    cache.put(request, res.clone());
    if (trim) trimCache(cacheName, trim);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
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
    event.respondWith(cacheFirst(request, TILE_CACHE, TILE_LIMIT));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'tessdata.projectnaptha.com' || url.hostname === 'unpkg.com') {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return; // API ภายนอก (แปลภาษา/ค้นหา) ปล่อยผ่าน

  if (/\/(_next\/static|icons|ocr)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }
  event.respondWith(networkFirst(request));
});
