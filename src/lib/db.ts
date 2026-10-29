// ชั้นเก็บข้อมูลออฟไลน์ (IndexedDB ผ่าน Dexie) — ข้อมูลทั้งหมดอยู่ในเครื่อง ไม่มีเซิร์ฟเวอร์
import Dexie, { type Table } from 'dexie';
import { countryOf, type Country } from './country';

export type PreCategory = 'flight' | 'hotel' | 'insurance' | 'esim' | 'other';
export type DayCategory = 'food' | 'travel' | 'shopping' | 'other';
/** ผู้จ่าย = id ของสมาชิกในทริป หรือ 'both' = จ่ายจากกองกลาง/ร่วมกัน */
export type Payer = string;
export type PlaceKind = 'hotel' | 'spot';

/** ล็อตการแลกเงิน: จ่ายเงินบาท thb ได้เงินท้องถิ่น jpy (ชื่อฟิลด์เดิม — เป็นเยนหรือหยวนตามประเทศของทริป) */
export interface RateLot {
  id: string;
  jpy: number;
  thb: number;
  note: string;
}

/** สมาชิกในทริป (id สั้น ๆ ไม่ซ้ำในทริป — ทริปเก่าใช้ 'a' กับ 'b') */
export interface Member {
  id: string;
  name: string;
}

/** shared = กระเป๋าเงินร่วม ไม่คิดเงินคืน · split = หารกัน แอปคิดให้ว่าใครต้องโอนให้ใคร */
export type SplitMode = 'shared' | 'split';

/** ทริปหนึ่งครั้ง — ค่าใช้จ่าย/แผนเที่ยวทุกรายการผูกกับทริปด้วย tripUid */
export interface Trip {
  id?: number;
  uid: string;
  name: string;
  country: Country;
  tripStart: string; // YYYY-MM-DD หรือ '' ถ้ายังไม่ตั้ง
  days: number;
  rateMode: 'fixed' | 'lots';
  fixedRate: number; // บาทต่อ 1 หน่วยเงินท้องถิ่น
  rateLots: RateLot[];
  members: Member[];
  splitMode: SplitMode;
  createdAt: number;
}

/** ค่าที่ใช้ร่วมทุกทริป (เก็บในตาราง settings แถว 'main') */
export interface AppSettings {
  id: 'main';
  nameA: string; // ชื่อของฉัน (ใช้ทักทาย และเป็นชื่อสมาชิกคนแรกของทริปใหม่)
  nameB?: string; // เลิกใช้แล้ว (สมัยมี 2 คนตายตัว) — เก็บไว้เพื่อย้ายข้อมูล
  notes: string; // ข้อมูลสำคัญที่อยากเก็บไว้ (เลขกรมธรรม์ เบอร์สถานทูต ฯลฯ)
  activeTrip: string; // uid ของทริปที่เปิดอยู่
  me: Record<string, string>; // ในแต่ละทริป เครื่องนี้คือสมาชิกคนไหน (tripUid → member id) — ไม่ซิงก์ไปเครื่องอื่น
  autoVisit?: boolean; // ติ๊ก "ไปแล้ว" อัตโนมัติเมื่อถึงหมุด (GPS ขณะเปิดแอป) — เฉพาะเครื่องนี้
}

/** มุมมองที่หน้าต่าง ๆ ใช้: ทริปที่เปิดอยู่ + ค่าร่วม (ชื่อเดิม Settings เพื่อให้โค้ดเดิมใช้ต่อได้) */
export type Settings = Omit<Trip, 'id'> & Pick<AppSettings, 'nameA' | 'notes' | 'autoVisit'> & { me: string };

const GLOBAL_KEYS = ['nameA', 'notes', 'autoVisit'] as const;

/** id สมาชิกสั้น ๆ (พอสำหรับไม่ซ้ำในทริปเดียว และใส่ใน QR ได้) */
export const newMemberId = (): string => Math.random().toString(36).slice(2, 8);

export function newTrip(country: Country = 'JP', patch: Partial<Trip> = {}): Trip {
  return {
    uid: newUid(),
    name: `ทริป${countryOf(country).name}`,
    country,
    tripStart: '',
    days: 7,
    rateMode: 'fixed',
    fixedRate: countryOf(country).defaultRate,
    rateLots: [],
    members: [{ id: newMemberId(), name: 'ฉัน' }],
    splitMode: 'shared',
    createdAt: Date.now(),
    ...patch,
  };
}

export const DEFAULT_SETTINGS: Settings = {
  ...newTrip('JP', { uid: '', days: 14, members: [] }),
  nameA: 'ฉัน',
  notes: '',
  me: '',
};

/** ค่าใช้จ่ายส่วนที่ 1: จ่ายล่วงหน้าเป็นบาท (ตั๋วเครื่องบิน ที่พัก ประกัน อีซิม) */
export interface PreExpense {
  id?: number;
  uid: string;
  tripUid: string;
  category: PreCategory;
  title: string;
  thb: number;
  payer?: Payer;
  split?: string[]; // หารกับใครบ้าง (ไม่มี = ทุกคน)
  note: string;
  createdAt: number;
  updatedAt?: number; // ใช้ตัดสินตอนรวมข้อมูลจากเพื่อน (ใหม่กว่าชนะ)
}

/** ค่าใช้จ่ายส่วนที่ 2: ใช้จ่ายระหว่างทริปเป็นเงินท้องถิ่น (ฟิลด์ jpy = เยนหรือหยวนตามประเทศ) จดรายวัน */
export interface DailyExpense {
  id?: number;
  uid: string;
  tripUid: string;
  day: number;
  category: DayCategory;
  title: string;
  jpy: number;
  payer?: Payer;
  split?: string[]; // หารกับใครบ้าง (ไม่มี = ทุกคน)
  placeUid?: string;
  receipt?: Blob;
  note: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Place {
  id?: number;
  uid: string;
  tripUid: string;
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
  photos?: Blob[]; // รูปสถานที่หลายรูป (รูปแรก = รูปปก) เลื่อนดูในป๊อปอัปหมุด
  photo?: Blob; // เลิกใช้แล้ว (สมัยรูปเดียว) — v5 ย้ายเข้า photos
  visited: boolean;
  visitedAt?: number; // เวลาที่ติ๊กว่าไปแล้ว
  visitedAuto?: boolean; // ติ๊กอัตโนมัติจาก GPS
  sample?: boolean;
  createdAt: number;
  updatedAt?: number;
}

/** แคชพยากรณ์อากาศ (Open-Meteo) ต่อพิกัด — ไว้ดูตอนออฟไลน์ ไม่ใช่ข้อมูลผู้ใช้ จึงไม่อยู่ในไฟล์สำรอง */
export interface WeatherDay {
  date: string; // YYYY-MM-DD (เวลาท้องถิ่นของพิกัดนั้น)
  code: number; // รหัสสภาพอากาศ WMO
  tMax: number;
  tMin: number;
  pop: number | null; // โอกาสฝน/หิมะ (%)
  snow: number; // หิมะสะสม (ซม.)
  wind: number; // ลมแรงสุด (กม./ชม.)
}

export interface WeatherCache {
  key: string; // "lat,lng" ปัดทศนิยม 2 ตำแหน่ง
  fetchedAt: number;
  days: WeatherDay[];
}

class TripDB extends Dexie {
  settings!: Table<AppSettings, string>;
  trips!: Table<Trip, number>;
  pre!: Table<PreExpense, number>;
  daily!: Table<DailyExpense, number>;
  places!: Table<Place, number>;
  weather!: Table<WeatherCache, string>;

  constructor() {
    super('hokkaido-trip');
    this.version(1).stores({
      settings: 'id',
      pre: '++id, &uid, category',
      daily: '++id, &uid, day, category',
      places: '++id, &uid, day',
    });
    this.version(2).stores({ weather: 'key' });
    // v3: หลายทริป — ย้ายข้อมูลทริปเดียวเดิมเข้าเป็นทริปแรก ไม่มีข้อมูลหาย
    this.version(3)
      .stores({
        trips: '++id, &uid',
        pre: '++id, &uid, category, tripUid',
        daily: '++id, &uid, day, category, tripUid',
        places: '++id, &uid, day, tripUid',
      })
      .upgrade(async (tx) => {
        const old = ((await tx.table('settings').get('main')) ?? {}) as Partial<Settings> & { id?: string };
        const trip = newTrip('JP', {
          name: 'ฮอกไกโด',
          tripStart: old.tripStart ?? '',
          days: old.days ?? 14,
          rateMode: old.rateMode ?? 'fixed',
          fixedRate: old.fixedRate ?? 0.23,
          rateLots: old.rateLots ?? [],
          members: [], // v4 จะใส่สมาชิก 'a'/'b' ให้ตรงกับป้ายผู้จ่ายเดิม
        });
        await tx.table('trips').add(trip);
        for (const t of ['pre', 'daily', 'places']) {
          await tx.table(t).toCollection().modify({ tripUid: trip.uid });
        }
        await tx.table('settings').put({
          id: 'main',
          nameA: old.nameA ?? 'ฉัน',
          nameB: (old as { nameB?: string }).nameB ?? 'เพื่อนร่วมทริป',
          notes: old.notes ?? '',
          activeTrip: trip.uid,
        });
      });
    // v4: สมาชิกหลายคน + โหมดหาร — 2 คนเดิมกลายเป็นสมาชิก id 'a' กับ 'b' (ป้ายผู้จ่ายเดิมใช้ต่อได้)
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const app = ((await tx.table('settings').get('main')) ?? {}) as Partial<AppSettings>;
        const me: Record<string, string> = { ...(app.me ?? {}) };
        await tx
          .table('trips')
          .toCollection()
          .modify((t: Trip) => {
            if (!t.members?.length) {
              t.members = [
                { id: 'a', name: app.nameA || 'ฉัน' },
                { id: 'b', name: app.nameB || 'เพื่อนร่วมทริป' },
              ];
            }
            t.splitMode = t.splitMode ?? 'shared';
            me[t.uid] = me[t.uid] ?? 'a';
          });
        for (const name of ['pre', 'daily', 'places']) {
          await tx
            .table(name)
            .toCollection()
            .modify((r: { updatedAt?: number; createdAt: number }) => {
              r.updatedAt = r.updatedAt ?? r.createdAt;
            });
        }
        await tx.table('settings').put({ ...app, id: 'main', me });
      });

    // v5: รูปสถานที่ได้หลายรูป — ย้ายรูปเดียวเดิม (photo) เข้า photos
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('places')
          .toCollection()
          .modify((p: Place) => {
            if (p.photo && !p.photos?.length) p.photos = [p.photo];
            delete p.photo;
          });
      });

    // ประทับเวลาแก้ไขอัตโนมัติ (ใช้รวมข้อมูลจากเพื่อน: รายการที่แก้ทีหลังชนะ) — ถ้าส่ง updatedAt มาเอง (ตอนนำเข้า) จะใช้ค่านั้น
    for (const t of [this.pre, this.daily, this.places] as Table<{ updatedAt?: number }, number>[]) {
      t.hook('creating', (_pk, obj) => {
        if (obj.updatedAt == null) obj.updatedAt = Date.now();
      });
      t.hook('updating', (mods) => ('updatedAt' in (mods as object) ? undefined : { updatedAt: Date.now() }));
    }
  }
}

export const db = new TripDB();

/** รหัสเฉพาะของแต่ละรายการ — ใช้ตอนรวมข้อมูลจาก 2 เครื่องโดยไม่ซ้ำ */
export function newUid(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && 'randomUUID' in c) return (c as Crypto).randomUUID();
  return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function getAppSettings(): Promise<AppSettings> {
  const cur = await db.settings.get('main');
  return {
    id: 'main',
    nameA: cur?.nameA ?? DEFAULT_SETTINGS.nameA,
    nameB: cur?.nameB,
    notes: cur?.notes ?? '',
    activeTrip: cur?.activeTrip ?? '',
    me: cur?.me ?? {},
  };
}

/** ทริปที่เปิดอยู่ (ถ้ายังไม่มีทริปเลยจะสร้างให้ 1 ทริป) */
export async function ensureActiveTrip(): Promise<Trip> {
  const app = await getAppSettings();
  const trips = await db.trips.toArray();
  let trip = trips.find((t) => t.uid === app.activeTrip) ?? trips.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!trip) {
    const meId = newMemberId();
    trip = newTrip('JP', { members: [{ id: meId, name: app.nameA }] });
    await db.trips.add(trip);
    app.me = { ...app.me, [trip.uid]: meId };
    await db.settings.put({ ...app, activeTrip: trip.uid });
  }
  if (trip.uid !== app.activeTrip) await db.settings.put({ ...app, activeTrip: trip.uid });
  return trip;
}

/** บันทึกค่า: ชื่อ/โน้ต เก็บเป็นค่าร่วม ส่วนที่เหลือ (วันที่ เรท ล็อต ฯลฯ) เก็บลงทริปที่เปิดอยู่ */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const app = await getAppSettings();
  const globalPatch: Partial<AppSettings> = {};
  const tripPatch: Partial<Trip> = {};
  for (const [k, v] of Object.entries(patch)) {
    if ((GLOBAL_KEYS as readonly string[]).includes(k)) (globalPatch as Record<string, unknown>)[k] = v;
    else if (k === 'me') globalPatch.me = { ...app.me }; // ตั้งด้านล่างเมื่อรู้ uid ทริป
    else if (k !== 'uid') (tripPatch as Record<string, unknown>)[k] = v;
  }
  const trip = await ensureActiveTrip();
  if (globalPatch.me && patch.me) globalPatch.me[trip.uid] = patch.me;
  if (Object.keys(globalPatch).length) await db.settings.put({ ...app, ...globalPatch });
  if (Object.keys(tripPatch).length && trip.id != null) await db.trips.update(trip.id, tripPatch);
}

export async function setActiveTrip(uid: string): Promise<void> {
  await db.settings.put({ ...(await getAppSettings()), activeTrip: uid });
}

/** ลบทริปพร้อมข้อมูลทั้งหมดของทริปนั้น (รูปใบเสร็จ/รูปสถานที่ด้วย) — ย้อนกลับไม่ได้ */
export async function deleteTrip(uid: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.pre, db.daily, db.places, db.settings], async () => {
    await db.pre.where('tripUid').equals(uid).delete();
    await db.daily.where('tripUid').equals(uid).delete();
    await db.places.where('tripUid').equals(uid).delete();
    await db.trips.where('uid').equals(uid).delete();
  });
  await ensureActiveTrip();
}

/** ขนาดข้อมูลโดยประมาณของทริป (ไบต์) — ส่วนใหญ่มาจากรูป */
export async function tripSize(uid: string): Promise<number> {
  const [pre, daily, places] = await Promise.all([
    db.pre.where('tripUid').equals(uid).toArray(),
    db.daily.where('tripUid').equals(uid).toArray(),
    db.places.where('tripUid').equals(uid).toArray(),
  ]);
  const json = (x: unknown) => JSON.stringify(x).length;
  let n = json(pre);
  for (const d of daily) n += json({ ...d, receipt: undefined }) + (d.receipt?.size ?? 0);
  for (const p of places) n += json({ ...p, photos: undefined }) + (p.photos ?? []).reduce((a, b) => a + b.size, 0);
  return n;
}

/** ขอให้เบราว์เซอร์เก็บข้อมูลถาวร (สำคัญบน iOS ที่อาจล้างข้อมูลเองถ้าไม่ได้ใช้นาน) */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
