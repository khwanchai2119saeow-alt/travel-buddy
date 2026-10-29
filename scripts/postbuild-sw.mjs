// หลัง next build: ใส่รายชื่อไฟล์ทั้งหมดที่ต้องใช้ออฟไลน์ลงใน out/sw.js
// (ไฟล์ JS ที่โหลดทีหลัง เช่น แผนที่ Leaflet / html2canvas / jsPDF ไม่ได้อยู่ใน HTML จึงต้องบอก Service Worker เอง)
// และตั้ง VERSION ใหม่ทุก build เพื่อให้แคชเก่าถูกล้าง
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out');
const swPath = path.join(out, 'sw.js');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!fs.existsSync(swPath)) {
  console.log('[sw] ไม่พบ out/sw.js — ข้าม');
  process.exit(0);
}

const rel = (p) => './' + path.relative(out, p).split(path.sep).join('/');
const files = [
  ...walk(path.join(out, '_next', 'static')).filter((f) => !f.endsWith('.map')),
  ...walk(out).filter((f) => f.endsWith('index.txt') && !f.includes(`${path.sep}404${path.sep}`)),
  ...walk(path.join(out, 'icons')),
  path.join(out, 'manifest.webmanifest'),
].filter((f) => fs.existsSync(f));
const list = Array.from(new Set(files.map(rel))).sort();

const buildId = fs.existsSync(path.join(root, '.next', 'BUILD_ID'))
  ? fs.readFileSync(path.join(root, '.next', 'BUILD_ID'), 'utf8').trim()
  : Date.now().toString(36);

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${buildId}';`);
sw = sw.replace(/const PRECACHE = \[\];/, `const PRECACHE = ${JSON.stringify(list)};`);
fs.writeFileSync(swPath, sw);
// GitHub Pages: ปิด Jekyll ไม่งั้นโฟลเดอร์ _next จะถูกซ่อน
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`[sw] ใส่รายชื่อไฟล์ precache ${list.length} ไฟล์ · VERSION ${buildId}`);
