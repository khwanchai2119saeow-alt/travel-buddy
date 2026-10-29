import type { Place } from './db';

/** รูปของสถานที่ (รองรับข้อมูลเก่าที่มีรูปเดียวในฟิลด์ photo) */
export function placePhotos(p: Pick<Place, 'photos' | 'photo'>): Blob[] {
  if (p.photos?.length) return p.photos;
  return p.photo ? [p.photo] : [];
}

export const MAX_PLACE_PHOTOS = 10;
