import type { Settings } from './db';
import { COUNTRIES, countryOf, type Country, type CountryInfo } from './country';

// สกุลเงินท้องถิ่นของทริปที่เปิดอยู่ — ตั้งโดย useSettings() ทุกครั้งที่อ่านทริป (แอปแสดงทีละทริป)
let active: CountryInfo = COUNTRIES.JP;
export function setActiveCountry(c: Country): void {
  active = countryOf(c);
}
export const activeCountry = (): CountryInfo => active;

/** เงินท้องถิ่น (เยน: ¥1,200 / หยวน: CN¥12.50) */
export const fmtCur = (n: number, c: CountryInfo = active): string => {
  const v = n || 0;
  const hasFraction = c.decimals > 0 && Math.round(v * 100) % 100 !== 0; // 35.5 → 35.50 แต่ 120 → 120
  return c.sym + v.toLocaleString('en-US', { minimumFractionDigits: hasFraction ? c.decimals : 0, maximumFractionDigits: c.decimals });
};

export const fmtThb = (n: number): string =>
  '฿' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtThb0 = (n: number): string => '฿' + Math.round(n || 0).toLocaleString('en-US');

/** YYYY-MM-DD ตามเวลาเครื่อง (ไม่ใช่ UTC) */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** วันที่ของ "วันที่ N" ของทริป ถ้ายังไม่ตั้งวันเริ่มต้นจะคืน null */
export function dayDate(s: Pick<Settings, 'tripStart'>, day: number): Date | null {
  if (!s.tripStart) return null;
  const d = new Date(s.tripStart + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + day - 1);
  return d;
}

export function dayShort(s: Pick<Settings, 'tripStart'>, day: number): string {
  const d = dayDate(s, day);
  return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';
}

export function dayLabel(s: Pick<Settings, 'tripStart'>, day: number): string {
  const short = dayShort(s, day);
  return short ? `วันที่ ${day} · ${short}` : `วันที่ ${day}`;
}

/** วันที่ของทริปที่ตรงกับ "วันนี้" (ถ้านอกช่วงทริปหรือไม่ได้ตั้งวันเริ่ม → วันที่ 1) */
export function todayDay(s: Pick<Settings, 'tripStart' | 'days'>): number {
  if (!s.tripStart) return 1;
  const start = new Date(s.tripStart + 'T00:00:00');
  if (isNaN(start.getTime())) return 1;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
  if (diff < 1 || diff > s.days) return 1;
  return diff;
}

export function inTripNow(s: Pick<Settings, 'tripStart' | 'days'>): boolean {
  if (!s.tripStart) return false;
  const start = new Date(s.tripStart + 'T00:00:00');
  if (isNaN(start.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
  return diff >= 1 && diff <= s.days;
}

/** ช่วงวันที่ของทริป เช่น "22–27 ธ.ค. 2569" หรือ "28 ธ.ค. 2569 – 3 ม.ค. 2570" */
export function tripRangeText(s: Pick<Settings, 'tripStart' | 'days'>): string {
  const a = dayDate(s, 1);
  const b = dayDate(s, s.days);
  if (!a || !b) return `${s.days} วัน · ยังไม่ตั้งวันที่`;
  const full = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${full(b)} · ${s.days} วัน`;
  }
  return `${full(a)} – ${full(b)} · ${s.days} วัน`;
}
