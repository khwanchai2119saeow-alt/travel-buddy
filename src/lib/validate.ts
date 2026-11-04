// ตรวจ/ทำความสะอาดข้อมูลที่มาจากนอกเครื่อง (ลิงก์เชิญ, ไฟล์สำรอง/อัปเดตจากเพื่อน) ก่อนเขียนลงฐานข้อมูล
// ข้อมูลเสีย/ผิดชนิดจะถูกข้าม แทนที่จะทำให้ยอดเงินหรือแผนที่พัง
import type { DayCategory, Member, PlaceKind, PreCategory, RateLot, Trip } from './db';

export const MAX_DAYS = 60;

const DAY_CATS: DayCategory[] = ['food', 'travel', 'shopping', 'other'];
const PRE_CATS: PreCategory[] = ['flight', 'hotel', 'insurance', 'esim', 'other'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const optStr = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
const optNum = (v: unknown): number | undefined => num(v) ?? undefined;
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 100) : undefined;
const dayNo = (v: unknown): number | null => {
  const n = num(v);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 366 ? n : null;
};
const isImageDataUrl = (v: unknown): v is string => typeof v === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(v);

export function cleanMembers(v: unknown): Member[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Member[] = [];
  for (const m of v) {
    if (!isObj(m)) continue;
    const id = str(m.id, 40);
    const name = str(m.name, 60).trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.slice(0, 50);
}

export function cleanLots(v: unknown): RateLot[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((l): RateLot[] => {
    if (!isObj(l)) return [];
    const id = str(l.id, 100);
    const jpy = num(l.jpy);
    const thb = num(l.thb);
    return id && jpy != null && jpy > 0 && thb != null && thb > 0 ? [{ id, jpy, thb, note: str(l.note, 200) }] : [];
  });
}

/** ทริปจากลิงก์เชิญ/ไฟล์ — ผิดรูปแบบคืน null (members ว่างได้ ไฟล์รุ่นเก่ายังไม่มีระบบสมาชิก) */
export function cleanTrip(v: unknown): Omit<Trip, 'id'> | null {
  if (!isObj(v)) return null;
  const uid = str(v.uid, 100);
  const name = str(v.name, 120).trim();
  const days = num(v.days);
  if (!uid || !name || (v.country !== 'JP' && v.country !== 'CN')) return null;
  if (days == null || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
  if (v.members != null && !Array.isArray(v.members)) return null;
  const fixedRate = num(v.fixedRate);
  return {
    uid,
    name,
    country: v.country,
    tripStart: typeof v.tripStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.tripStart) ? v.tripStart : '',
    days,
    rateMode: v.rateMode === 'lots' ? 'lots' : 'fixed',
    fixedRate: fixedRate != null && fixedRate > 0 ? fixedRate : 0,
    rateLots: cleanLots(v.rateLots),
    members: cleanMembers(v.members),
    splitMode: v.splitMode === 'split' ? 'split' : 'shared',
    createdAt: num(v.createdAt) ?? Date.now(),
  };
}

interface Common {
  uid: string;
  tripUid?: string;
  createdAt: number;
  updatedAt?: number;
}

function common(v: Obj): Common | null {
  const uid = str(v.uid, 100);
  if (!uid) return null;
  return { uid, tripUid: optStr(v.tripUid, 100), createdAt: num(v.createdAt) ?? 0, updatedAt: optNum(v.updatedAt) };
}

export interface CleanPre extends Common {
  category: PreCategory;
  title: string;
  thb: number;
  payer?: string;
  split?: string[];
  note: string;
}

export function cleanPre(v: unknown): CleanPre | null {
  if (!isObj(v)) return null;
  const c = common(v);
  const thb = num(v.thb);
  if (!c || thb == null || thb < 0) return null;
  return {
    ...c,
    category: PRE_CATS.includes(v.category as PreCategory) ? (v.category as PreCategory) : 'other',
    title: str(v.title, 300),
    thb,
    payer: optStr(v.payer, 40),
    split: strList(v.split),
    note: str(v.note, 1000),
  };
}

export interface CleanDaily extends Common {
  day: number;
  category: DayCategory;
  title: string;
  jpy: number;
  payer?: string;
  split?: string[];
  placeUid?: string;
  note: string;
  receipt?: string; // dataURL
}

export function cleanDaily(v: unknown): CleanDaily | null {
  if (!isObj(v)) return null;
  const c = common(v);
  const day = dayNo(v.day);
  const jpy = num(v.jpy);
  if (!c || day == null || jpy == null || jpy < 0) return null;
  return {
    ...c,
    day,
    category: DAY_CATS.includes(v.category as DayCategory) ? (v.category as DayCategory) : 'other',
    title: str(v.title, 300),
    jpy,
    payer: optStr(v.payer, 40),
    split: strList(v.split),
    placeUid: optStr(v.placeUid, 100),
    note: str(v.note, 2000),
    receipt: isImageDataUrl(v.receipt) ? v.receipt : undefined,
  };
}

export interface CleanPlace extends Common {
  day: number;
  order: number;
  kind: PlaceKind;
  title: string;
  lat: number;
  lng: number;
  note: string;
  time: string;
  bookingCode: string;
  checkIn: string;
  photos?: string[]; // dataURL · undefined = ไฟล์ไม่มีข้อมูลรูป
  photoCredits?: string[];
  visited: boolean;
  visitedAt?: number;
  visitedAuto?: boolean;
  sample?: boolean;
}

export function cleanPlace(v: unknown): CleanPlace | null {
  if (!isObj(v)) return null;
  const c = common(v);
  const day = dayNo(v.day);
  const lat = num(v.lat);
  const lng = num(v.lng);
  const title = str(v.title, 200).trim();
  if (!c || day == null || !title || lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const photos = Array.isArray(v.photos) ? v.photos.filter(isImageDataUrl) : isImageDataUrl(v.photo) ? [v.photo] : undefined;
  return {
    ...c,
    day,
    order: num(v.order) ?? 0,
    kind: v.kind === 'hotel' ? 'hotel' : 'spot',
    title,
    lat,
    lng,
    note: str(v.note, 2000),
    time: str(v.time, 20),
    bookingCode: str(v.bookingCode, 100),
    checkIn: str(v.checkIn, 40),
    photos: photos?.slice(0, 10),
    photoCredits: Array.isArray(v.photoCredits) ? v.photoCredits.map((x) => str(x, 200)).slice(0, 10) : undefined,
    visited: v.visited === true,
    visitedAt: optNum(v.visitedAt),
    visitedAuto: v.visitedAuto === true ? true : undefined,
    sample: v.sample === true ? true : undefined,
  };
}

/** รายการ uid ซ้ำในไฟล์เดียวกัน → เก็บตัวที่แก้ล่าสุด (กันชนดัชนี &uid ตอนเขียนทีเดียว) */
export function newestByUid<T extends { uid: string; updatedAt?: number }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const cur = m.get(r.uid);
    if (!cur || (r.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) m.set(r.uid, r);
  }
  return [...m.values()];
}
