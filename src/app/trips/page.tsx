'use client';
// ทริปทั้งหมด: เลือกทริปที่จะใช้ · สร้างทริปใหม่ (ญี่ปุ่น/จีน) · ทำทริปร่วมกับเพื่อน (QR เชิญ + ส่ง/รับอัปเดต)
// จบทริปแล้วเก็บสรุป PDF/ไฟล์สำรอง แล้วลบเพื่อลดขนาดข้อมูล
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteTrip, getAppSettings, newMemberId, newTrip, setActiveTrip, tripSize, type Trip } from '@/lib/db';
import { COUNTRY_LIST, countryOf, type Country } from '@/lib/country';
import { effectiveRate, useSettings } from '@/lib/stats';
import { fmtCur, fmtThb0, tripRangeText, ymd } from '@/lib/format';
import { exportAll, importMerge } from '@/lib/backup';
import { decodeInvite, inviteCode, inviteUrl, qrDataUrl, readQrFromImage } from '@/lib/invite';
import { downloadBlob, shareFile } from '@/lib/image';
import { Modal, PageHeader } from '@/components/ui';

const MAX_DAYS = 60;

function daysBetween(a: string, b: string): number {
  const d = Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1;
  return isFinite(d) ? d : 0;
}

function endDate(t: Pick<Trip, 'tripStart' | 'days'>): string {
  if (!t.tripStart) return '';
  const d = new Date(t.tripStart + 'T00:00:00');
  d.setDate(d.getDate() + t.days - 1);
  return ymd(d);
}

type Status = 'now' | 'upcoming' | 'past' | 'nodate';
function statusOf(t: Trip): Status {
  if (!t.tripStart) return 'nodate';
  const today = ymd(new Date());
  if (today < t.tripStart) return 'upcoming';
  if (today > endDate(t)) return 'past';
  return 'now';
}
const STATUS_TH: Record<Status, string> = { now: 'กำลังเที่ยว', upcoming: 'กำลังจะไป', past: 'จบแล้ว', nodate: 'ยังไม่ตั้งวันที่' };

export default function TripsPage() {
  const router = useRouter();
  const active = useSettings();
  const loaded = useLiveQuery(() => db.trips.toArray(), []);
  const trips = useMemo(() => loaded ?? [], [loaded]);
  // ยอดรวมแต่ละทริป (บาท) — คิดจากค่าใช้จ่ายล่วงหน้า + รายวัน × เรทของทริปนั้น
  const totals = useLiveQuery(async () => {
    const [pre, daily] = await Promise.all([db.pre.toArray(), db.daily.toArray()]);
    const m = new Map<string, { thb: number; local: number; count: number }>();
    for (const p of pre) {
      const x = m.get(p.tripUid) ?? { thb: 0, local: 0, count: 0 };
      x.thb += p.thb;
      x.count++;
      m.set(p.tripUid, x);
    }
    for (const d of daily) {
      const x = m.get(d.tripUid) ?? { thb: 0, local: 0, count: 0 };
      x.local += d.jpy;
      x.count++;
      m.set(d.tripUid, x);
    }
    return m;
  }, []);

  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState<Trip | null>(null);
  const [joining, setJoining] = useState(false);

  // เรียง: กำลังเที่ยว → กำลังจะไป (ใกล้สุดก่อน) → ยังไม่ตั้งวันที่ → จบแล้ว (ล่าสุดก่อน)
  const sorted = useMemo(() => {
    const rank: Record<Status, number> = { now: 0, upcoming: 1, nodate: 2, past: 3 };
    return [...trips].sort((a, b) => {
      const ra = rank[statusOf(a)];
      const rb = rank[statusOf(b)];
      if (ra !== rb) return ra - rb;
      if (ra === 3) return b.tripStart.localeCompare(a.tripStart);
      return a.tripStart.localeCompare(b.tripStart) || a.createdAt - b.createdAt;
    });
  }, [trips]);

  async function open(t: Trip) {
    await setActiveTrip(t.uid);
    router.push('/');
  }

  return (
    <>
      <PageHeader
        title="ทริปของฉัน"
        back="/"
        subtitle={loaded ? `${trips.length} ทริป · แตะเพื่อเปิดใช้` : 'กำลังโหลด…'}
        right={
          <button className="btn-primary !px-4 !py-1.5" onClick={() => setCreating(true)}>
            ＋ ทริปใหม่
          </button>
        }
      />

      <section className="space-y-3 px-4 pb-4">
        {sorted.map((t) => {
          const C = countryOf(t.country);
          const st = statusOf(t);
          const sum = totals?.get(t.uid);
          const isActive = t.uid === active.uid;
          const thb = (sum?.thb ?? 0) + (sum?.local ?? 0) * effectiveRate({ ...active, ...t });
          return (
            <div key={t.uid} className={`card !p-0 ${isActive ? 'ring-2 ring-ios-blue' : ''}`}>
              <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => open(t)}>
                <span className="text-4xl leading-none">{C.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[17px] font-semibold">{t.name}</span>
                    {isActive && <span className="shrink-0 rounded-full bg-ios-blue px-2 py-0.5 text-[11px] font-semibold text-white">เปิดอยู่</span>}
                  </span>
                  <span className="block truncate text-[13px] text-ios-secondary">{tripRangeText(t)}</span>
                  <span className="block text-[13px] text-ios-secondary">
                    {STATUS_TH[st]} · {sum?.count ?? 0} รายการ · รวม {fmtThb0(thb)}
                    {sum?.local ? ` (${fmtCur(sum.local, C)})` : ''}
                  </span>
                </span>
              </button>
              <div className="flex border-t-[0.5px] border-ios-separator">
                <button className="flex-1 py-2.5 text-[15px] text-ios-blue" onClick={() => open(t)}>
                  เปิดทริปนี้
                </button>
                <button className="flex-1 border-l-[0.5px] border-ios-separator py-2.5 text-[15px] text-ios-blue" onClick={() => setManage(t)}>
                  เพื่อน / สรุป / ลบ…
                </button>
              </div>
            </div>
          );
        })}

        <button className="card flex w-full items-center gap-3 text-left" onClick={() => setJoining(true)}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ios-green text-xl text-white">👥</span>
          <span className="flex-1">
            <span className="block text-[17px] font-semibold">เข้าร่วมทริปของเพื่อน</span>
            <span className="block text-[13px] text-ios-secondary">ถ่ายรูป QR เชิญ หรือวางลิงก์ที่เพื่อนส่งมา</span>
          </span>
          <span className="text-ios-tertiary">›</span>
        </button>

        <div className="rounded-widget bg-ios-blue/10 p-4 text-[15px]">
          <div className="font-semibold text-ios-blue">วิธีใช้หลายทริป</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ios-label/80">
            <li>สร้างทริปล่วงหน้าได้เลย เลือกประเทศ วันที่ และเรทแลกเงินของทริปนั้น</li>
            <li>ก่อนออกเดินทาง แตะทริปนั้นให้ “เปิดอยู่” — ทุกหน้าในแอปจะเป็นของทริปนี้</li>
            <li>ไปกับเพื่อน: “เพื่อน / สรุป / ลบ…” → เชิญเพื่อนด้วย QR แล้วส่ง/รับอัปเดตกันทาง AirDrop · LINE · WeChat</li>
            <li>จบทริปแล้ว: เก็บสรุป PDF และไฟล์สำรอง แล้วค่อยลบเพื่อให้แอปเบาลง</li>
          </ol>
        </div>
      </section>

      <NewTripSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (t) => {
          setCreating(false);
          await open(t);
        }}
      />
      <JoinSheet open={joining} onClose={() => setJoining(false)} />
      {manage && <ManageSheet trip={manage} isActive={manage.uid === active.uid} onClose={() => setManage(null)} />}
    </>
  );
}

function NewTripSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Trip) => void }) {
  const [country, setCountry] = useState<Country>('JP');
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rate, setRate] = useState('');
  const [myName, setMyName] = useState('');
  const [friends, setFriends] = useState('');
  const [mode, setMode] = useState<'shared' | 'split'>('shared');
  const [msg, setMsg] = useState('');
  const C = countryOf(country);

  useEffect(() => {
    if (!open) return;
    setCountry('JP');
    setName('');
    setStart('');
    setEnd('');
    setRate('');
    setFriends('');
    setMode('shared');
    setMsg('');
    getAppSettings().then((a) => setMyName(a.nameA));
  }, [open]);

  const days = start && end ? daysBetween(start, end) : 0;

  async function create() {
    if (!start || !end) return setMsg('เลือกวันไปและวันกลับก่อน');
    if (days < 1) return setMsg('วันกลับต้องไม่ก่อนวันไป');
    if (days > MAX_DAYS) return setMsg(`ทริปยาวได้ไม่เกิน ${MAX_DAYS} วัน`);
    const r = parseFloat(rate.replace(/,/g, ''));
    const meId = newMemberId();
    const others = friends
      .split(/[,，、\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((n) => ({ id: newMemberId(), name: n }));
    const t = newTrip(country, {
      name: name.trim() || C.centerName,
      tripStart: start,
      days,
      fixedRate: r > 0 ? r / C.rateUnit : C.defaultRate,
      members: [{ id: meId, name: myName.trim() || 'ฉัน' }, ...others],
      splitMode: others.length ? mode : 'shared',
    });
    await db.trips.add(t);
    const app = await getAppSettings();
    await db.settings.put({ ...app, me: { ...app.me, [t.uid]: meId } });
    onCreated(t);
  }

  return (
    <Modal open={open} onClose={onClose} title="ทริปใหม่">
      <div className="space-y-4">
        <div className="segmented grid-cols-2">
          {COUNTRY_LIST.map((c) => (
            <button key={c.code} className={country === c.code ? 'seg-on !py-2 !text-[15px]' : 'seg !py-2 !text-[15px]'} onClick={() => setCountry(c.code)}>
              {c.flag} {c.name}
            </button>
          ))}
        </div>
        <div>
          <label className="label">ชื่อทริป</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`เช่น ${C.centerName}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">วันไป</label>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">วันกลับ</label>
            <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {days > 0 && <p className="px-1 text-[13px] text-ios-secondary">รวม {days} วัน</p>}
        <div>
          <label className="label">
            เรทแลกเงิน: {C.rateUnit} {C.curName} = กี่บาท (ไม่บังคับ แก้ทีหลังได้)
          </label>
          <input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={(C.defaultRate * C.rateUnit).toFixed(2)} />
        </div>
        <div>
          <label className="label">ชื่อของฉัน</label>
          <input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} />
        </div>
        <div>
          <label className="label">เพื่อนร่วมทริป (คั่นด้วยจุลภาค ไม่มีก็เว้นว่าง เพิ่มทีหลังได้)</label>
          <input className="input" value={friends} onChange={(e) => setFriends(e.target.value)} placeholder="เช่น นิด, โอ๊ต, แพร" />
        </div>
        {friends.trim() && (
          <div className="segmented grid-cols-2">
            <button className={mode === 'shared' ? 'seg-on' : 'seg'} onClick={() => setMode('shared')}>
              กระเป๋าเงินร่วม
            </button>
            <button className={mode === 'split' ? 'seg-on' : 'seg'} onClick={() => setMode('split')}>
              หารกัน (คิดเงินคืน)
            </button>
          </div>
        )}
        {country === 'CN' && (
          <p className="rounded-xl bg-ios-orange/10 p-3 text-[13px] text-ios-orange">
            ในจีน Google Maps ใช้ไม่ได้ถ้าไม่มี VPN แอปจะใช้ Apple Maps นำทางแทน · ก่อนบินให้เปิดแอปตอนมีเน็ต แล้วลองสแกนใบเสร็จ/แปลป้ายภาษาจีน 1 ครั้ง เพื่อเก็บข้อมูลไว้ใช้ออฟไลน์
          </p>
        )}
        {msg && <p className="text-[15px] text-ios-red">{msg}</p>}
        <button className="btn-primary w-full !py-3" onClick={create}>
          สร้างและเปิดทริปนี้
        </button>
      </div>
    </Modal>
  );
}

function ManageSheet({ trip, isActive, onClose }: { trip: Trip; isActive: boolean; onClose: () => void }) {
  const router = useRouter();
  const C = countryOf(trip.country);
  const [size, setSize] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [qr, setQr] = useState('');
  const [link, setLink] = useState('');

  useEffect(() => {
    tripSize(trip.uid).then(setSize);
  }, [trip.uid]);

  async function toSummary() {
    await setActiveTrip(trip.uid);
    router.push('/summary/');
  }

  async function backup() {
    const blob = await exportAll(trip.uid);
    const fileName = `สำรองทริป-${trip.name}-${ymd(new Date())}.json`;
    const shared = await shareFile(new File([blob], fileName, { type: 'application/json' }), `ไฟล์สำรองทริป${trip.name}`);
    if (!shared) downloadBlob(blob, fileName);
    setMsg('สร้างไฟล์สำรองทริปนี้แล้ว — เก็บไว้ในแอปไฟล์/iCloud Drive หรือส่งเข้า LINE Keep ได้ นำกลับมาได้ที่ ตั้งค่า → นำเข้า');
  }

  async function invite() {
    const url = inviteUrl(inviteCode(trip));
    setLink(url);
    setQr(await qrDataUrl(url));
  }

  async function shareInvite() {
    try {
      if (navigator.share) await navigator.share({ title: `ชวนเข้าทริป ${trip.name}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setMsg('คัดลอกลิงก์เชิญแล้ว');
      }
    } catch {
      /* ผู้ใช้ยกเลิก */
    }
  }

  async function sendUpdate() {
    const blob = await exportAll(trip.uid);
    const fileName = `อัปเดตทริป-${trip.name}-${ymd(new Date())}.json`;
    const shared = await shareFile(new File([blob], fileName, { type: 'application/json' }), `อัปเดตทริป${trip.name}`);
    if (!shared) downloadBlob(blob, fileName);
    setMsg('ส่งแล้ว — เพื่อนบันทึกไฟล์ลงแอปไฟล์ แล้วกด “รับอัปเดตจากเพื่อน” ในทริปเดียวกัน');
  }

  async function receiveUpdate(file?: File | null) {
    if (!file) return;
    try {
      const r = await importMerge(await file.text(), { overwriteSettings: false });
      setMsg(`รับอัปเดตแล้ว: ค่าใช้จ่าย +${r.pre + r.daily} · สถานที่ +${r.places} · แก้ไข ${r.updated} · สมาชิก +${r.members}${r.trips ? ` · ทริปใหม่ ${r.trips}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function remove() {
    await deleteTrip(trip.uid);
    onClose();
  }

  const mb = size == null ? '…' : (size / 1024 / 1024).toFixed(size > 1024 * 1024 ? 1 : 2);
  const canDelete = confirmText.trim() === 'ลบ';

  return (
    <Modal open onClose={onClose} title={`${C.flag} ${trip.name}`}>
      <div className="space-y-4">
        <p className="px-1 text-[15px] text-ios-secondary">
          {tripRangeText(trip)} · ข้อมูลทริปนี้ประมาณ {mb} MB
        </p>

        <div className="section-title !px-1">👥 ทำทริปร่วมกับเพื่อน ({trip.members.length} คน)</div>
        <div className="ios-list">
          <button className="ios-row w-full text-left" onClick={invite}>
            <span className="text-xl">📷</span>
            <span className="flex-1">
              <span className="block">เชิญเพื่อนเข้าทริป (QR)</span>
              <span className="block text-[13px] text-ios-secondary">เพื่อนเปิดแอป → ทริปของฉัน → เข้าร่วมทริปของเพื่อน → ถ่ายรูป QR นี้</span>
            </span>
            <span className="text-ios-tertiary">›</span>
          </button>
          <button className="ios-row w-full text-left" onClick={sendUpdate}>
            <span className="text-xl">📤</span>
            <span className="flex-1">
              <span className="block">ส่งอัปเดตให้กลุ่ม</span>
              <span className="block text-[13px] text-ios-secondary">ส่งทาง AirDrop (ไม่ต้องใช้เน็ต) · LINE · WeChat</span>
            </span>
            <span className="text-ios-tertiary">›</span>
          </button>
          <label className="ios-row w-full cursor-pointer text-left">
            <span className="text-xl">📥</span>
            <span className="flex-1">
              <span className="block">รับอัปเดตจากเพื่อน</span>
              <span className="block text-[13px] text-ios-secondary">เลือกไฟล์ที่เพื่อนส่งมา — รายการไม่ซ้ำ ของที่เพื่อนแก้ทีหลังจะถูกอัปเดต</span>
            </span>
            <span className="text-ios-tertiary">›</span>
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { receiveUpdate(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        {qr && (
          <div className="card space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR เชิญเข้าทริป" className="mx-auto w-60 max-w-full rounded-xl bg-white p-2" style={{ imageRendering: 'pixelated' }} />
            <p className="text-[13px] text-ios-secondary">ให้เพื่อนถ่ายรูป QR นี้จากในแอป (เมนู “เข้าร่วมทริปของเพื่อน”) หรือส่งลิงก์ให้</p>
            <button className="btn-ghost w-full" onClick={shareInvite}>
              ส่งลิงก์เชิญ (LINE · WeChat · AirDrop)
            </button>
          </div>
        )}

        <div className="section-title !px-1">จบทริป</div>
        <div className="ios-list">
          <button className="ios-row w-full text-left" onClick={toSummary}>
            <span className="text-xl">📄</span>
            <span className="flex-1">
              <span className="block">1. ดูสรุปทริป / บันทึก PDF</span>
              <span className="block text-[13px] text-ios-secondary">เก็บไว้ดูย้อนหลังได้ แม้ลบทริปแล้ว</span>
            </span>
            <span className="text-ios-tertiary">›</span>
          </button>
          <button className="ios-row w-full text-left" onClick={backup}>
            <span className="text-xl">💾</span>
            <span className="flex-1">
              <span className="block">2. สำรองข้อมูลทริปนี้ (JSON)</span>
              <span className="block text-[13px] text-ios-secondary">รวมรูปใบเสร็จ/รูปสถานที่ นำกลับเข้าแอปได้ภายหลัง</span>
            </span>
            <span className="text-ios-tertiary">›</span>
          </button>
        </div>
        {msg && <p className="rounded-xl bg-ios-green/10 p-3 text-[13px] text-ios-green">{msg}</p>}

        <div className="space-y-2 rounded-widget bg-ios-card p-4">
          <div className="font-semibold text-ios-red">3. ลบทริปนี้</div>
          <p className="text-[13px] text-ios-secondary">
            ลบค่าใช้จ่าย แผนเที่ยว รูปใบเสร็จ และรูปสถานที่ของทริปนี้ทั้งหมด (ประมาณ {mb} MB) ทริปอื่นไม่เกี่ยว ย้อนกลับไม่ได้ — ทำข้อ 1 และ 2 ก่อน
            {isActive ? ' · ทริปนี้เปิดอยู่ ลบแล้วแอปจะสลับไปทริปอื่นให้' : ''}
          </p>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="พิมพ์คำว่า ลบ เพื่อยืนยัน" />
          <button className="btn-danger w-full" onClick={remove} disabled={!canDelete}>
            ลบทริปนี้ถาวร
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** เข้าร่วมทริปของเพื่อน: ถ่าย/เลือกรูป QR (อ่านในเครื่อง) หรือวางลิงก์เชิญ → ไปหน้าเข้าร่วม */
function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setMsg('');
    }
  }, [open]);

  function go(input: string) {
    const p = decodeInvite(input);
    if (!p) return setMsg('อ่านลิงก์/รหัสเชิญไม่ได้ — ตรวจว่าคัดลอกมาครบ');
    const code = input.match(/[#&?]t=([A-Za-z0-9_-]+)/)?.[1] ?? input.trim();
    onClose();
    router.push(`/join/#t=${code}`);
  }

  async function fromPhoto(file?: File | null) {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const data = await readQrFromImage(file);
      if (!data) setMsg('หา QR ในรูปไม่เจอ — ถ่ายให้ QR อยู่กลางภาพ ชัด ๆ เต็มกรอบ');
      else go(data);
    } catch {
      setMsg('เปิดรูปไม่ได้');
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="เข้าร่วมทริปของเพื่อน">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-primary cursor-pointer !py-3">
            {busy ? 'กำลังอ่าน…' : '📷 ถ่ายรูป QR'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <label className="btn-ghost cursor-pointer !py-3">
            🖼️ เลือกรูป QR
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <div>
          <label className="label">หรือวางลิงก์เชิญที่เพื่อนส่งมา</label>
          <textarea className="input text-[13px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/join/#t=…" />
        </div>
        {msg && <p className="text-[15px] text-ios-red">{msg}</p>}
        <button className="btn-primary w-full" onClick={() => go(text)} disabled={!text.trim()}>
          ถัดไป
        </button>
        <p className="px-1 text-[12px] text-ios-secondary">
          อ่าน QR ในเครื่อง ไม่ต้องใช้เน็ต · ถ้าสแกนด้วยแอปกล้องแล้วเปิดใน Safari ให้กด “คัดลอกลิงก์เชิญ” ที่หน้านั้น แล้วกลับมาวางที่นี่
        </p>
      </div>
    </Modal>
  );
}
