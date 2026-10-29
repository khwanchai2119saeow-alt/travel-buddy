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

interface PackedDaily extends Omit<DailyExpense, 'receipt' | 'id'> {
  receipt?: string;
}
interface PackedPlace extends Omit<Place, 'photo' | 'photos' | 'id'> {
  photos?: string[]; // dataURL หลายรูป
  photo?: string; // ไฟล์รุ่นเก่า (รูปเดียว)
}

/** รูปในไฟล์ → Blob (รองรับไฟล์เก่าที่มีรูปเดียว) · undefined = ไฟล์ไม่มีข้อมูลรูป */
async function unpackPhotos(p: { photos?: string[]; photo?: string }): Promise<Blob[] | undefined> {
  const list = p.photos ?? (p.photo ? [p.photo] : undefined);
  return list ? Promise.all(list.map(dataUrlToBlob)) : undefined;
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

/** ไฟล์รุ่นเก่า (ทริปเดียว) — รายการไม่มี tripUid */
interface BackupFileV1 {
  app: 'hokkaido-trip';
  version: 1;
  settings?: Partial<Settings> & { nameB?: string };
  pre: Omit<PreExpense, 'id' | 'tripUid'>[];
  daily: Omit<PackedDaily, 'tripUid'>[];
  places: Omit<PackedPlace, 'tripUid'>[];
}

/** สำรองทุกทริป หรือเฉพาะทริปเดียว (ส่ง tripUid) */
export async function exportAll(tripUid?: string): Promise<Blob> {
  const only = <T extends { tripUid: string }>(rows: T[]) => (tripUid ? rows.filter((r) => r.tripUid === tripUid) : rows);
  const [app, trips, pre, daily, places] = await Promise.all([
    getAppSettings(),
    db.trips.toArray(),
    db.pre.toArray(),
    db.daily.toArray(),
    db.places.toArray(),
  ]);
  const packedDaily: PackedDaily[] = [];
  for (const d of only(daily)) {
    const { receipt, id, ...rest } = d;
    void id;
    packedDaily.push({ ...rest, receipt: receipt ? await blobToDataUrl(receipt) : undefined });
  }
  const packedPlaces: PackedPlace[] = [];
  for (const p of only(places)) {
    const { photo, photos, id, ...rest } = p;
    void id;
    const all = photos?.length ? photos : photo ? [photo] : [];
    packedPlaces.push({ ...rest, photos: await Promise.all(all.map(blobToDataUrl)) });
  }
  const file: BackupFile = {
    app: 'hokkaido-trip',
    version: 2,
    exportedAt: new Date().toISOString(),
    shared: { nameA: app.nameA, notes: app.notes },
    trips: trips.filter((t) => !tripUid || t.uid === tripUid).map(({ id, ...rest }) => (void id, rest)),
    pre: only(pre).map(({ id, ...rest }) => (void id, rest)),
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

export async function importMerge(text: string, opts: { overwriteSettings: boolean }): Promise<ImportResult> {
  let data: BackupFile | BackupFileV1;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองที่อ่านได้');
  }
  if (data?.app !== 'hokkaido-trip' || !Array.isArray(data.pre) || !Array.isArray(data.daily) || !Array.isArray(data.places)) {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้');
  }

  const result: ImportResult = { trips: 0, pre: 0, daily: 0, places: 0, lots: 0, updated: 0, members: 0 };
  const active = await ensureActiveTrip();
  const localTrips = await db.trips.toArray();
  const tripUids = new Set(localTrips.map((t) => t.uid));

  if (data.version === 2) {
    // ทริป: ทริปใหม่ → เพิ่ม · ทริปที่มีอยู่แล้ว → รวมล็อตแลกเงิน (และเขียนทับค่าอื่นถ้าเลือก)
    for (const t of data.trips ?? []) {
      const local = localTrips.find((x) => x.uid === t.uid);
      // ไฟล์ก่อนมีระบบสมาชิก → ใช้ 2 คนเดิม (id 'a'/'b' ตรงกับป้ายผู้จ่ายในไฟล์)
      const incomingMembers: Member[] = t.members?.length
        ? t.members
        : [
            { id: 'a', name: data.shared?.nameA || 'คนที่ 1' },
            { id: 'b', name: data.shared?.nameB || 'คนที่ 2' },
          ];
      if (!local) {
        await db.trips.add({ ...t, members: incomingMembers, splitMode: t.splitMode ?? 'shared' });
        tripUids.add(t.uid);
        result.trips++;
        continue;
      }
      const { lots, added } = mergeLots(local.rateLots, t.rateLots);
      const mem = mergeMembers(local.members, incomingMembers);
      result.lots += added;
      result.members += mem.added;
      const patch: Partial<Trip> = opts.overwriteSettings
        ? { ...t, rateLots: lots, members: mem.members, splitMode: t.splitMode ?? local.splitMode }
        : { rateLots: lots, members: mem.members };
      if (added || mem.added || opts.overwriteSettings) await db.trips.update(local.id!, patch);
    }
    if (opts.overwriteSettings && data.shared) {
      await db.settings.put({ ...(await getAppSettings()), nameA: data.shared.nameA, notes: data.shared.notes });
    }
  } else {
    // รุ่น 1: ทุกอย่างเข้าทริปที่เปิดอยู่
    const s = data.settings ?? {};
    const { lots, added } = mergeLots(active.rateLots, s.rateLots);
    result.lots += added;
    const patch: Partial<Trip> = { rateLots: lots };
    if (opts.overwriteSettings) {
      Object.assign(patch, {
        tripStart: s.tripStart ?? active.tripStart,
        days: s.days ?? active.days,
        rateMode: s.rateMode ?? active.rateMode,
        fixedRate: s.fixedRate ?? active.fixedRate,
      });
      await db.settings.put({ ...(await getAppSettings()), nameA: s.nameA ?? 'ฉัน', notes: s.notes ?? '' });
    }
    await db.trips.update(active.id!, patch);
  }

  // รายการที่อ้างถึงทริปที่ไม่มีอยู่จริง → เข้าทริปที่เปิดอยู่
  const tripOf = (r: { tripUid?: string }) => (r.tripUid && tripUids.has(r.tripUid) ? r.tripUid : active.uid);

  // รายการใหม่ → เพิ่ม · มีอยู่แล้วแต่ของในไฟล์แก้ทีหลัง → แทนที่ (รูปในไฟล์ไม่มี = ใช้รูปเดิม)
  const newer = (incoming?: number, local?: number) => (incoming ?? 0) > (local ?? 0);

  const localPre = new Map((await db.pre.toArray()).map((x) => [x.uid, x]));
  for (const p of data.pre as (Omit<PreExpense, 'id' | 'tripUid'> & { tripUid?: string })[]) {
    if (!p.uid) continue;
    const cur = localPre.get(p.uid);
    if (!cur) {
      await db.pre.add({ ...p, tripUid: tripOf(p) });
      result.pre++;
    } else if (newer(p.updatedAt, cur.updatedAt)) {
      await db.pre.put({ ...p, id: cur.id, tripUid: cur.tripUid });
      result.updated++;
    }
  }

  const localDaily = new Map((await db.daily.toArray()).map((x) => [x.uid, x]));
  for (const d of data.daily as (Omit<PackedDaily, 'tripUid'> & { tripUid?: string })[]) {
    if (!d.uid) continue;
    const { receipt, ...rest } = d;
    const cur = localDaily.get(d.uid);
    if (!cur) {
      await db.daily.add({ ...rest, tripUid: tripOf(d), receipt: receipt ? await dataUrlToBlob(receipt) : undefined });
      result.daily++;
    } else if (newer(d.updatedAt, cur.updatedAt)) {
      await db.daily.put({ ...rest, id: cur.id, tripUid: cur.tripUid, receipt: receipt ? await dataUrlToBlob(receipt) : cur.receipt });
      result.updated++;
    }
  }

  const localPlaces = new Map((await db.places.toArray()).map((x) => [x.uid, x]));
  for (const p of data.places as (Omit<PackedPlace, 'tripUid'> & { tripUid?: string })[]) {
    if (!p.uid) continue;
    const { photo, photos, ...rest } = p;
    const blobs = await unpackPhotos({ photo, photos });
    const cur = localPlaces.get(p.uid);
    if (!cur) {
      await db.places.add({ ...rest, tripUid: tripOf(p), photos: blobs ?? [] });
      result.places++;
    } else if (newer(p.updatedAt, cur.updatedAt)) {
      await db.places.put({ ...rest, id: cur.id, tripUid: cur.tripUid, photos: blobs ?? cur.photos ?? (cur.photo ? [cur.photo] : []) });
      result.updated++;
    }
  }
  return result;
}

export async function wipeAll(): Promise<void> {
  await Promise.all([db.pre.clear(), db.daily.clear(), db.places.clear(), db.settings.clear(), db.trips.clear(), db.weather.clear()]);
  await ensureActiveTrip();
}
