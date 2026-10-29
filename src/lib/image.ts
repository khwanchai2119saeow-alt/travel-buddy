// ตัวช่วยจัดการรูป: ย่อรูปก่อนเก็บ/ก่อน OCR, ดาวน์โหลด/แชร์ไฟล์

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('เปิดรูปไม่ได้'));
    };
    img.src = url;
  });
}

/** ย่อรูปให้ด้านยาวไม่เกิน maxSide แล้วบีบเป็น JPEG (ประหยัดพื้นที่ IndexedDB) */
export async function shrinkImage(blob: Blob, maxSide = 1000, quality = 0.8): Promise<Blob> {
  const img = await loadImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('บีบรูปไม่สำเร็จ'))), 'image/jpeg', quality),
  );
}

/** เตรียมรูปสำหรับ OCR: ย่อ + ขาวดำ + เพิ่มคอนทราสต์ (ทำเองด้วยพิกเซล เพราะ iOS Safari ไม่รองรับ ctx.filter) */
export async function prepareForOcr(blob: Blob, maxSide = 1800): Promise<Blob> {
  const img = await loadImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // หาค่าความสว่างต่ำ/สูงเพื่อยืดคอนทราสต์
  let lo = 255;
  let hi = 0;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    gray[j] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((gray[j] - lo) / range) * 255;
    const out = v < 0 ? 0 : v > 255 ? 255 : v;
    px[i] = px[i + 1] = px[i + 2] = out;
  }
  ctx.putImageData(data, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('เตรียมรูปไม่สำเร็จ'))), 'image/png'),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** แชร์ไฟล์ผ่านเมนูแชร์ของมือถือ (LINE ฯลฯ) ถ้าไม่รองรับจะคืน false */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title });
      return true;
    }
  } catch {
    /* ผู้ใช้ยกเลิก หรือไม่รองรับ */
  }
  return false;
}
