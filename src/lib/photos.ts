import type { Place } from './db';
import { shrinkImage } from './image';

/** รูปของสถานที่ (รองรับข้อมูลเก่าที่มีรูปเดียวในฟิลด์ photo) */
export function placePhotos(p: Pick<Place, 'photos' | 'photo'>): Blob[] {
  if (p.photos?.length) return p.photos;
  return p.photo ? [p.photo] : [];
}

export const MAX_PLACE_PHOTOS = 10;

/** เครดิตเจ้าของภาพ เรียงตรงกับ photos ('' = รูปที่ผู้ใช้ใส่เอง) */
export function placeCredits(p: Pick<Place, 'photoCredits'>, count: number): string[] {
  return Array.from({ length: count }, (_, i) => p.photoCredits?.[i] ?? '');
}

export interface WebPhoto {
  blob: Blob;
  credit: string;
  source: string; // ชื่อไฟล์ต้นทาง กันดึงรูปซ้ำ
}

interface CommonsPage {
  title: string;
  index?: number;
  imageinfo?: {
    thumburl?: string;
    mime?: string;
    width?: number;
    extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } };
  }[];
}

const SKIP_TITLE = /\b(map|logo|diagram|plan|sign|icon|flag|coat of arms)\b|地図/i;

async function commonsSearch(name: string): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `intitle:"${name.replace(/"/g, '')}" filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '960',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error('หารูปไม่สำเร็จ');
  const data: { query?: { pages?: Record<string, CommonsPage> } } = await res.json();
  return Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** ชื่อเจ้าของภาพจาก metadata ซึ่งเป็น HTML — แปลงเป็นข้อความล้วน ไม่ใส่ HTML ลงหน้าเว็บ */
function plainText(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** หารูปสถานที่จาก Wikimedia Commons (ฟรี ไม่ต้องใช้ key) ด้วยชื่อที่ตรงกับชื่อไฟล์เท่านั้น — ไม่ตรงก็ไม่ใส่ ดีกว่าได้รูปผิดที่ */
export async function findPlacePhotos(names: string[], exclude: Set<string>, limit = 3): Promise<WebPhoto[]> {
  const out: WebPhoto[] = [];
  const terms = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2)));
  for (const term of terms) {
    if (out.length >= limit) break;
    for (const p of await commonsSearch(term)) {
      if (out.length >= limit) break;
      const info = p.imageinfo?.[0];
      if (!info?.thumburl || info.mime !== 'image/jpeg' || (info.width ?? 0) < 800) continue;
      if (exclude.has(p.title) || out.some((x) => x.source === p.title) || SKIP_TITLE.test(p.title)) continue;
      try {
        const res = await fetch(info.thumburl);
        if (!res.ok) continue;
        const artist = plainText(info.extmetadata?.Artist?.value ?? '') || 'ไม่ระบุชื่อ';
        const license = info.extmetadata?.LicenseShortName?.value ?? '';
        out.push({
          blob: await shrinkImage(await res.blob(), 1000, 0.8),
          credit: `ภาพ: ${artist.slice(0, 60)}${license ? ` · ${license}` : ''} · Wikimedia Commons`,
          source: p.title,
        });
      } catch {
        /* รูปนี้โหลดไม่ได้ ข้ามไป */
      }
    }
  }
  return out;
}
