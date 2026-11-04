// สำรอง / กู้คืน / รวมข้อมูลจาก 2 เครื่อง ด้วยไฟล์ JSON (รูปถูกเก็บเป็น dataURL ในไฟล์)
// การรวม: ใช้ uid เป็นตัวตัดสิน — ทริปหรือรายการที่มีอยู่แล้วจะไม่ถูกเพิ่มซ้ำ
// รายการที่มีอยู่แล้วแต่อีกเครื่องแก้ทีหลัง (updatedAt ใหม่กว่า) → ใช้ของใหม่ · สมาชิกทริปรวมกันแบบไม่ซ้ำ
// ใช้เป็น "ส่งอัปเดตให้กลุ่ม" ด้วย (ส่งไฟล์สำรองเฉพาะทริปให้เพื่อนกดรับ)
// ไฟล์รุ่น 2 มีหลายทริป · ไฟล์รุ่น 1 (ก่อนมีระบบหลายทริป) ยังนำเข้าได้ โดยรวมเข้าทริปที่เปิดอยู่
import {
  db,
  ensureActiveTrip,
  getAppSettings,
  type AppSettings,
  type DailyExpense,
  type Member,
  type Place,
  type PreExpense,
  type RateLot,
  type Settings,
  type Trip,
} from './db';
import { blobToDataUrl, dataUrlToBlob } from './image';
import { cleanDaily, cleanLots, cleanPlace, cleanPre, cleanTrip, newestByUid } from './validate';

interface PackedDaily extends Omit<DailyExpense, 'receipt' | 'id'> {
  receipt?: string;
}
interface PackedPlace extends Omit<Place, 'photo' | 'photos' | 'id'> {
  photos?: string[]; // dataURL หลายรูป
  photo?: string; // ไฟล์รุ่นเก่า (รูปเดียว)
}

/** dataURL → Blob · เสีย/อ่านไม่ได้ → undefined (ข้ามรูปนั้น ไม่ให้ทั้งไฟล์ล้ม) */
async function toBlob(dataUrl?: string): Promise<Blob | undefined> {
  if (!dataUrl) return undefined;
  try {
    return await dataUrlToBlob(dataUrl);
  } catch {
    return undefined;
  }
}
type Shared = Pick<AppSettings, 'nameA' | 'notes'> & { nameB?: string };

export interface BackupFile {
  app: 'hokkaido-trip';
  version: 2;
  exportedAt: string;
  shared: Shared;
  trips: Omit<Trip, 'id'>[];
  pre: Omit<PreExpense, 'id'>[];
  daily: PackedDaily[];
  places: PackedPlace[];
}

/** สำรองทุกทริป หรือเฉพาะทริปเดียว (ส่ง tripUid) — อ่านเฉพาะข้อมูลของทริปนั้นจากดัชนี ไม่โหลดรูปของทริปอื่น */
export async function exportAll(tripUid?: string): Promise<Blob> {
  const rows = <T,>(t: { where(i: string): { equals(v: string): { toArray(): Promise<T[]> } }; toArray(): Promise<T[]> }) =>
    tripUid ? t.where('tripUid').equals(tripUid).toArray() : t.toArray();
  const [app, trips, pre, daily, places] = await Promise.all([
    getAppSettings(),
    tripUid ? db.trips.where('uid').equals(tripUid).toArray() : db.trips.toArray(),
    rows<PreExpense>(db.pre),
    rows<DailyExpense>(db.daily),
    rows<Place>(db.places),
  ]);
  const packedDaily = await Promise.all(
    daily.map(async ({ receipt, id, ...rest }): Promise<PackedDaily> => {
      void id;
      return { ...rest, receipt: receipt ? await blobToDataUrl(receipt) : undefined };
    }),
  );
  const packedPlaces = await Promise.all(
    places.map(async ({ photo, photos, id, ...rest }): Promise<PackedPlace> => {
      void id;
      const all = photos?.length ? photos : photo ? [photo] : [];
      return { ...rest, photos: await Promise.all(all.map(blobToDataUrl)) };
    }),
  );
  const file: BackupFile = {
    app: 'hokkaido-trip',
    version: 2,
    exportedAt: new Date().toISOString(),
    shared: { nameA: app.nameA, notes: app.notes },
    trips: trips.map(({ id, ...rest }) => (void id, rest)),
    pre: pre.map(({ id, ...rest }) => (void id, rest)),
    daily: packedDaily,
    places: packedPlaces,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export interface ImportResult {
  trips: number;
  pre: number;
  daily: number;
  places: number;
  lots: number;
  updated: number; // รายการที่อัปเดตตามที่เพื่อนแก้
  members: number; // สมาชิกใหม่ที่เพิ่มเข้าทริป
  skipped: number; // รายการในไฟล์ที่ข้อมูลเสีย จึงข้ามไป
}

const mergeMembers = (mine: Member[] = [], theirs: Member[] = []) => {
  const have = new Set(mine.map((m) => m.id));
  const added = theirs.filter((m) => !have.has(m.id));
  return { members: [...mine, ...added], added: added.length };
};

const mergeLots = (mine: RateLot[], theirs: RateLot[] = []) => {
  const have = new Set(mine.map((l) => l.id));
  const added = theirs.filter((l) => !have.has(l.id));
  return { lots: [...mine, ...added], added: added.length };
};

/** รวมไฟล์สำรอง/อัปเดตเข้าเครื่องนี้
 *  ขั้น 1 ตรวจข้อมูล + แปลงรูป (เฉพาะรายการที่จะเขียนจริง) · ขั้น 2 เขียนทั้งหมดในทรานแซกชันเดียว
 *  → ถ้าพังกลางทาง จะไม่มีอะไรถูกเขียนครึ่ง ๆ กลาง ๆ */
export async function importMerge(text: string, opts: { overwriteSettings: boolean }): Promise<ImportResult> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองที่อ่านได้');
  }
  const notOurs = new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้');
  if (!data || data.app !== 'hokkaido-trip') throw notOurs;
  if (data.version !== 1 && data.version !== 2) {
    if (typeof data.version === 'number' && data.version > 2) {
      throw new Error('ไฟล์นี้มาจากแอปรุ่นใหม่กว่า — ต่อเน็ตแล้วปิด/เปิดแอปใหม่ให้แอปอัปเดตก่อน แล้วลองอีกครั้ง');
    }
    throw notOurs;
  }
  if (!Array.isArray(data.pre) || !Array.isArray(data.daily) || !Array.isArray(data.places)) throw notOurs;

  const result: ImportResult = { trips: 0, pre: 0, daily: 0, places: 0, lots: 0, updated: 0, members: 0, skipped: 0 };
  const active = await ensureActiveTrip();
  const localTrips = await db.trips.toArray();
  const tripUids = new Set(localTrips.map((t) => t.uid));

  const tripAdds: Omit<Trip, 'id'>[] = [];
  const tripUpdates: { id: number; patch: Partial<Trip> }[] = [];
  let appPatch: Partial<AppSettings> | null = null;

  if (data.version === 2) {
    const shared = (data.shared ?? {}) as Partial<Shared>;
    // ทริป: ทริปใหม่ → เพิ่ม · ทริปที่มีอยู่แล้ว → รวมล็อตแลกเงิน/สมาชิก (และเขียนทับค่าอื่นถ้าเลือก)
    for (const raw of Array.isArray(data.trips) ? data.trips : []) {
      const t = cleanTrip(raw);
      if (!t) {
        result.skipped++;
        continue;
      }
      // ไฟล์ก่อนมีระบบสมาชิก → ใช้ 2 คนเดิม (id 'a'/'b' ตรงกับป้ายผู้จ่ายในไฟล์)
      const incomingMembers: Member[] = t.members.length
        ? t.members
        : [
            { id: 'a', name: shared.nameA || 'คนที่ 1' },
            { id: 'b', name: shared.nameB || 'คนที่ 2' },
          ];
      const local = localTrips.find((x) => x.uid === t.uid);
      if (!local) {
        if (tripUids.has(t.uid)) continue; // ซ้ำในไฟล์เดียวกัน
        tripAdds.push({ ...t, members: incomingMembers });
        tripUids.add(t.uid);
        result.trips++;
        continue;
      }
      const { lots, added } = mergeLots(local.rateLots, t.rateLots);
      const mem = mergeMembers(local.members, incomingMembers);
      result.lots += added;
      result.members += mem.added;
      const patch: Partial<Trip> = opts.overwriteSettings
        ? { ...t, rateLots: lots, members: mem.members }
        : { rateLots: lots, members: mem.members };
      if (added || mem.added || opts.overwriteSettings) tripUpdates.push({ id: local.id!, patch });
    }
    if (opts.overwriteSettings && typeof shared.nameA === 'string') {
      appPatch = { nameA: shared.nameA || 'ฉัน', notes: typeof shared.notes === 'string' ? shared.notes : '' };
    }
  } else {
    // รุ่น 1: ทุกอย่างเข้าทริปที่เปิดอยู่
    const s = (data.settings ?? {}) as Partial<Settings>;
    const { lots, added } = mergeLots(active.rateLots, cleanLots(s.rateLots));
    result.lots += added;
    const patch: Partial<Trip> = { rateLots: lots };
    if (opts.overwriteSettings) {
      const days = typeof s.days === 'number' && Number.isInteger(s.days) && s.days >= 1 && s.days <= 60 ? s.days : active.days;
      Object.assign(patch, {
        tripStart: typeof s.tripStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.tripStart) ? s.tripStart : active.tripStart,
        days,
        rateMode: s.rateMode === 'lots' || s.rateMode === 'fixed' ? s.rateMode : active.rateMode,
        fixedRate: typeof s.fixedRate === 'number' && s.fixedRate > 0 ? s.fixedRate : active.fixedRate,
      });
      appPatch = { nameA: typeof s.nameA === 'string' && s.nameA ? s.nameA : 'ฉัน', notes: typeof s.notes === 'string' ? s.notes : '' };
    }
    tripUpdates.push({ id: active.id!, patch });
  }

  // รายการที่อ้างถึงทริปที่ไม่มีอยู่จริง → เข้าทริปที่เปิดอยู่
  const tripOf = (r: { tripUid?: string }) => (r.tripUid && tripUids.has(r.tripUid) ? r.tripUid : active.uid);
  // มีอยู่แล้วแต่ของในไฟล์แก้ทีหลัง → แทนที่
  const newer = (incoming?: number, local?: number) => (incoming ?? 0) > (local ?? 0);
  function clean<T extends { uid: string; updatedAt?: number }>(rows: unknown[], fn: (v: unknown) => T | null): T[] {
    const ok = rows.map(fn).filter((x): x is T => !!x);
    result.skipped += rows.length - ok.length;
    return newestByUid(ok);
  }

  const pres = clean(data.pre, cleanPre);
  const dailies = clean(data.daily, cleanDaily);
  const places = clean(data.places, cleanPlace);
  // อ่านเฉพาะรายการในเครื่องที่ uid ตรงกับในไฟล์ (ไม่โหลดรูปของรายการอื่น)
  const [curPre, curDaily, curPlaces] = await Promise.all([
    db.pre.where('uid').anyOf(pres.map((x) => x.uid)).toArray(),
    db.daily.where('uid').anyOf(dailies.map((x) => x.uid)).toArray(),
    db.places.where('uid').anyOf(places.map((x) => x.uid)).toArray(),
  ]).then(([a, b, c]) => [new Map(a.map((x) => [x.uid, x])), new Map(b.map((x) => [x.uid, x])), new Map(c.map((x) => [x.uid, x]))] as const);

  const preAdd: PreExpense[] = [];
  const prePut: PreExpense[] = [];
  for (const p of pres) {
    const cur = curPre.get(p.uid);
    if (!cur) preAdd.push({ ...p, tripUid: tripOf(p) });
    else if (newer(p.updatedAt, cur.updatedAt)) prePut.push({ ...p, id: cur.id, tripUid: cur.tripUid });
  }

  const dailyAdd: DailyExpense[] = [];
  const dailyPut: DailyExpense[] = [];
  for (const d of dailies) {
    const { receipt, ...rest } = d;
    const cur = curDaily.get(d.uid);
    if (!cur) dailyAdd.push({ ...rest, tripUid: tripOf(d), receipt: await toBlob(receipt) });
    else if (newer(d.updatedAt, cur.updatedAt)) {
      dailyPut.push({ ...rest, id: cur.id, tripUid: cur.tripUid, receipt: (await toBlob(receipt)) ?? cur.receipt });
    }
  }

  const placeAdd: Place[] = [];
  const placePut: Place[] = [];
  const blobsOf = async (list?: string[]) => (list ? (await Promise.all(list.map(toBlob))).filter((b): b is Blob => !!b) : undefined);
  for (const p of places) {
    const { photos, ...rest } = p;
    const cur = curPlaces.get(p.uid);
    if (!cur) placeAdd.push({ ...rest, tripUid: tripOf(p), photos: (await blobsOf(photos)) ?? [] });
    else if (newer(p.updatedAt, cur.updatedAt)) {
      const blobs = await blobsOf(photos);
      const keep = cur.photos?.length ? cur.photos : cur.photo ? [cur.photo] : [];
      placePut.push({ ...rest, id: cur.id, tripUid: cur.tripUid, photos: blobs ?? keep, photoCredits: blobs ? rest.photoCredits : cur.photoCredits });
    }
  }

  await db.transaction('rw', [db.trips, db.settings, db.pre, db.daily, db.places], async () => {
    if (tripAdds.length) await db.trips.bulkAdd(tripAdds as Trip[]);
    for (const u of tripUpdates) await db.trips.update(u.id, u.patch);
    if (appPatch) await db.settings.put({ ...(await getAppSettings()), ...appPatch });
    if (preAdd.length) await db.pre.bulkAdd(preAdd);
    if (prePut.length) await db.pre.bulkPut(prePut);
    if (dailyAdd.length) await db.daily.bulkAdd(dailyAdd);
    if (dailyPut.length) await db.daily.bulkPut(dailyPut);
    if (placeAdd.length) await db.places.bulkAdd(placeAdd);
    if (placePut.length) await db.places.bulkPut(placePut);
  });
  result.pre = preAdd.length;
  result.daily = dailyAdd.length;
  result.places = placeAdd.length;
  result.updated = prePut.length + dailyPut.length + placePut.length;
  return result;
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', [db.pre, db.daily, db.places, db.settings, db.trips, db.weather], async () => {
    await Promise.all([db.pre.clear(), db.daily.clear(), db.places.clear(), db.settings.clear(), db.trips.clear(), db.weather.clear()]);
  });
  await ensureActiveTrip();
}
