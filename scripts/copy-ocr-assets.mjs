// คัดลอกไฟล์ OCR (Tesseract: ญี่ปุ่น อังกฤษ จีนตัวย่อ) ไปไว้ใน public/ocr เพื่อให้สแกนใบเสร็จ "ออฟไลน์ได้จริง"
// ไม่ต้องพึ่ง CDN ภายนอก ถ้าสคริปต์นี้ทำไม่สำเร็จ แอปจะ fallback ไปโหลดจาก CDN ฟรีของ tesseract.js เอง
// (ต้องมีเน็ตครั้งแรก แล้วเบราว์เซอร์จะแคชไว้ให้)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'ocr');

function walk(dir, found = [], depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return found;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, found, depth + 1);
    else found.push(p);
  }
  return found;
}

// เลือกโมเดลภาษา: fast (เล็ก เร็ว) → best_int → มาตรฐาน
function pickLang(lang) {
  const dir = path.join(nm, '@tesseract.js-data', lang);
  const files = walk(dir).filter((f) => f.endsWith(`${lang}.traineddata.gz`));
  const order = ['4.0.0_fast', '4.0.0_best_int', '4.0.0'];
  for (const tag of order) {
    const hit = files.find((f) => f.split(path.sep).includes(tag));
    if (hit) return hit;
  }
  return files[0] || null;
}

try {
  const workerSrc = path.join(nm, 'tesseract.js', 'dist', 'worker.min.js');
  const coreDir = path.join(nm, 'tesseract.js-core');
  const coreFiles = fs.existsSync(coreDir)
    ? fs.readdirSync(coreDir).filter((f) => /lstm/.test(f) && f.endsWith('.wasm.js'))
    : [];
  const jpn = pickLang('jpn');
  const eng = pickLang('eng');
  const chi = pickLang('chi_sim'); // ภาษาจีน (ไม่บังคับ — ไม่มีก็ยังสแกนญี่ปุ่นออฟไลน์ได้)

  if (!fs.existsSync(workerSrc) || coreFiles.length === 0 || !jpn || !eng) {
    console.log('[ocr] ไม่พบไฟล์ OCR ครบ → จะใช้ CDN ตอนรันแทน (ไม่เป็นไร)');
    process.exit(0);
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'core'), { recursive: true });
  fs.mkdirSync(path.join(out, 'lang'), { recursive: true });

  fs.copyFileSync(workerSrc, path.join(out, 'worker.min.js'));
  for (const f of coreFiles) fs.copyFileSync(path.join(coreDir, f), path.join(out, 'core', f));
  fs.copyFileSync(jpn, path.join(out, 'lang', 'jpn.traineddata.gz'));
  fs.copyFileSync(eng, path.join(out, 'lang', 'eng.traineddata.gz'));
  if (chi) fs.copyFileSync(chi, path.join(out, 'lang', 'chi_sim.traineddata.gz'));

  fs.writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify({ worker: true, core: true, jpn: true, eng: true, chi_sim: !!chi, builtAt: new Date().toISOString() }),
  );
  console.log(`[ocr] คัดลอกไฟล์ OCR ไปที่ public/ocr แล้ว (core ${coreFiles.length} ไฟล์)`);
} catch (err) {
  console.log('[ocr] คัดลอกไม่สำเร็จ → จะใช้ CDN ตอนรันแทน:', err && err.message);
}
process.exit(0);
