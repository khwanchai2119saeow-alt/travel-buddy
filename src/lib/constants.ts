import type { DayCategory, PreCategory } from './db';

export const PRE_CATS: { key: PreCategory; label: string; emoji: string }[] = [
  { key: 'flight', label: 'ตั๋วเครื่องบิน', emoji: '✈️' },
  { key: 'hotel', label: 'ที่พัก', emoji: '🏨' },
  { key: 'insurance', label: 'ประกันเดินทาง', emoji: '🛡️' },
  { key: 'esim', label: 'อีซิม / ซิม', emoji: '📶' },
  { key: 'other', label: 'อื่น ๆ', emoji: '🧳' },
];

export const DAY_CATS: { key: DayCategory; label: string; emoji: string; color: string }[] = [
  { key: 'food', label: 'ค่ากิน', emoji: '🍜', color: '#f97316' },
  { key: 'travel', label: 'ค่าเดินทาง', emoji: '🚃', color: '#0ea5e9' },
  { key: 'shopping', label: 'ช้อปปิ้ง', emoji: '🛍️', color: '#ec4899' },
  { key: 'other', label: 'อื่น ๆ', emoji: '🧾', color: '#94a3b8' },
];

export function preCat(key: PreCategory) {
  return PRE_CATS.find((c) => c.key === key) ?? PRE_CATS[PRE_CATS.length - 1];
}
export function dayCat(key: DayCategory) {
  return DAY_CATS.find((c) => c.key === key) ?? DAY_CATS[DAY_CATS.length - 1];
}


/** แผ่นแผนที่ฟรี (ไม่ต้องใช้ key) จาก OSM เยอรมนี (openstreetmap.de) — ป้ายชื่อญี่ปุ่นคู่อังกฤษ/โรมาจิ
 *  เช่น 中島公園 Nakajima-Koen ซูมได้สูงสุดระดับ 18 */
export const TILE_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
export const TILE_MAX_ZOOM = 18;
