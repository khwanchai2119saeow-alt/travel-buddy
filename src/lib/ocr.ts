// OCR ฝั่งเครื่อง (Tesseract.js) — ฟรี ไม่ส่งรูปไปไหน
// ถ้ามีไฟล์ใน public/ocr (คัดลอกตอน npm install) จะใช้แบบออฟไลน์เต็มรูปแบบ
// ถ้าไม่มีจะ fallback ไปโหลดจาก CDN ฟรีของ tesseract.js (ต้องมีเน็ตครั้งแรก)
import type { PSM, Worker } from 'tesseract.js';
import { BASE } from './base';

export type OcrProgress = (info: { status: string; progress: number }) => void;
export type OcrMode = 'receipt' | 'sign';

// เก็บ worker ไว้ทีละภาษา (สลับทริปญี่ปุ่น/จีน → ปิดตัวเก่าเพื่อคืนหน่วยความจำ)
let workerPromise: Promise<Worker> | null = null;
let workerLang = '';
let progressCb: OcrProgress | null = null;

/** ไฟล์ภาษาที่คัดลอกไว้ใน public/ocr ครบสำหรับภาษานี้ไหม (เช่น 'chi_sim+eng') */
async function localAssetsReady(lang: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/ocr/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return false;
    const j = await res.json();
    return !!(j.worker && j.core && lang.split('+').every((l) => j[l]));
  } catch {
    return false;
  }
}

function abs(path: string): string {
  return new URL(path, window.location.origin).href;
}

async function getWorker(lang: string): Promise<Worker> {
  if (workerPromise && workerLang !== lang) {
    const old = workerPromise;
    workerPromise = null;
    old.then((w) => w.terminate()).catch(() => {});
  }
  if (!workerPromise) {
    workerLang = lang;
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const local = await localAssetsReady(lang);
      const options: Record<string, unknown> = {
        logger: (m: { status: string; progress: number }) => progressCb?.(m),
      };
      if (local) {
        options.workerPath = abs(`${BASE}/ocr/worker.min.js`);
        options.corePath = abs(`${BASE}/ocr/core`);
        options.langPath = abs(`${BASE}/ocr/lang`);
        options.workerBlobURL = false;
      }
      return createWorker(lang, 1, options as never);
    })().catch((err) => {
      workerPromise = null; // ให้ลองใหม่ได้
      throw err;
    });
  }
  return workerPromise;
}

const STATUS_TH: Record<string, string> = {
  'loading tesseract core': 'กำลังโหลดตัวอ่านข้อความ…',
  'initializing tesseract': 'กำลังเริ่มระบบอ่านข้อความ…',
  'loading language traineddata': 'กำลังโหลดข้อมูลภาษา (ครั้งแรกเท่านั้น)…',
  'loaded language traineddata': 'โหลดข้อมูลภาษาแล้ว',
  'initializing api': 'กำลังเตรียมระบบ…',
  'recognizing text': 'กำลังอ่านข้อความจากรูป…',
};
export const statusTh = (s: string): string => STATUS_TH[s] ?? s;

/** อ่านข้อความจากรูป mode=receipt เหมาะกับใบเสร็จ, sign เหมาะกับป้าย (ข้อความกระจาย) · lang เช่น 'jpn+eng', 'chi_sim+eng' */
export async function recognize(image: Blob, mode: OcrMode, lang: string, onProgress?: OcrProgress): Promise<string> {
  progressCb = onProgress ?? null;
  try {
    const worker = await getWorker(lang);
    await worker.setParameters({
      tessedit_pageseg_mode: (mode === 'receipt' ? '6' : '11') as PSM, // 6 = บล็อกข้อความเดียว, 11 = ข้อความกระจาย
      preserve_interword_spaces: '1',
    });
    const { data } = await worker.recognize(image);
    return data.text ?? '';
  } finally {
    progressCb = null;
  }
}
