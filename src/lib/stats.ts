'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_SETTINGS,
  db,
  type DailyExpense,
  type DayCategory,
  type Place,
  type PreExpense,
  type Settings,
  type Trip,
} from './db';
import { setActiveCountry } from './format';

/** ทริปที่เปิดอยู่ + ค่าร่วม (ชื่อ/โน้ต) แบบสดใหม่เสมอ — ระหว่างโหลดจะได้ค่าเริ่มต้น (uid = '') */
export function useSettings(): Settings {
  const v = useLiveQuery(async () => {
    const [app, trips] = await Promise.all([db.settings.get('main'), db.trips.toArray()]);
    const trip = trips.find((t) => t.uid === app?.activeTrip) ?? trips.sort((a, b) => b.createdAt - a.createdAt)[0];
    return { app, trip };
  }, []);
  const view: Settings = {
    ...DEFAULT_SETTINGS,
    ...v?.trip,
    nameA: v?.app?.nameA ?? DEFAULT_SETTINGS.nameA,
    notes: v?.app?.notes ?? '',
    me: '',
  };
  view.members = view.members?.length ? view.members : DEFAULT_SETTINGS.members;
  view.splitMode = view.splitMode ?? 'shared';
  // เครื่องนี้คือใครในทริปนี้ (ไม่ได้เลือก → คนแรก)
  const mine = v?.app?.me?.[view.uid];
  view.me = view.members.some((m) => m.id === mine) ? mine! : view.members[0]?.id ?? '';
  delete (view as Partial<Trip>).id;
  setActiveCountry(view.country);
  return view;
}

/** สถานที่ของทริปที่เปิดอยู่ (undefined ระหว่างโหลด) */
export function useTripPlaces(tripUid: string): Place[] | undefined {
  return useLiveQuery(() => (tripUid ? db.places.where('tripUid').equals(tripUid).toArray() : []), [tripUid]);
}

/** เรทที่ใช้จริง (บาทต่อ 1 เยน)
 *  - โหมด "ล็อต": เฉลี่ยถ่วงน้ำหนักจากทุกการแลกเงิน = บาททั้งหมด ÷ เยนทั้งหมด
 *  - โหมด "คงที่": ใช้เรทที่ตั้งเอง */
export function effectiveRate(s: Settings): number {
  if (s.rateMode === 'lots' && s.rateLots.length > 0) {
    const jpy = s.rateLots.reduce((a, l) => a + (l.jpy || 0), 0);
    const thb = s.rateLots.reduce((a, l) => a + (l.thb || 0), 0);
    if (jpy > 0) return thb / jpy;
  }
  return s.fixedRate > 0 ? s.fixedRate : 0;
}

export type CatTotals = Record<DayCategory, number>;
const emptyCats = (): CatTotals => ({ food: 0, travel: 0, shopping: 0, other: 0 });

export interface DayStat {
  day: number;
  jpy: number;
  byCat: CatTotals;
  count: number;
}

export interface Stats {
  rate: number;
  preTotalThb: number;
  tripTotalJpy: number;
  tripTotalThb: number;
  grandThb: number;
  perDay: DayStat[];
  byCat: CatTotals;
  exchangedJpy: number;
  walletLeftJpy: number;
  activeDays: number;
  avgPerActiveDayJpy: number;
}

export function computeStats(s: Settings, pre: PreExpense[], daily: DailyExpense[]): Stats {
  const rate = effectiveRate(s);
  const perDay: DayStat[] = Array.from({ length: s.days }, (_, i) => ({
    day: i + 1,
    jpy: 0,
    byCat: emptyCats(),
    count: 0,
  }));
  const byCat = emptyCats();
  let tripTotalJpy = 0;

  for (const e of daily) {
    const idx = Math.min(Math.max(e.day, 1), s.days) - 1;
    const d = perDay[idx];
    d.jpy += e.jpy;
    d.byCat[e.category] += e.jpy;
    d.count += 1;
    byCat[e.category] += e.jpy;
    tripTotalJpy += e.jpy;
  }

  const preTotalThb = pre.reduce((a, p) => a + p.thb, 0);
  const tripTotalThb = tripTotalJpy * rate;
  const exchangedJpy = s.rateLots.reduce((a, l) => a + (l.jpy || 0), 0);
  const activeDays = perDay.filter((d) => d.jpy > 0).length;

  return {
    rate,
    preTotalThb,
    tripTotalJpy,
    tripTotalThb,
    grandThb: preTotalThb + tripTotalThb,
    perDay,
    byCat,
    exchangedJpy,
    walletLeftJpy: exchangedJpy - tripTotalJpy,
    activeDays,
    avgPerActiveDayJpy: activeDays > 0 ? tripTotalJpy / activeDays : 0,
  };
}

export function useStats(): { stats: Stats; settings: Settings; pre: PreExpense[]; daily: DailyExpense[] } {
  const settings = useSettings();
  const uid = settings.uid;
  const pre = useLiveQuery(() => (uid ? db.pre.where('tripUid').equals(uid).toArray() : []), [uid]) ?? [];
  const daily = useLiveQuery(() => (uid ? db.daily.where('tripUid').equals(uid).toArray() : []), [uid]) ?? [];
  return { stats: computeStats(settings, pre, daily), settings, pre, daily };
}
