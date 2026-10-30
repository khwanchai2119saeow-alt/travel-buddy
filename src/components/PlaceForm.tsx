'use client';
// ฟอร์มเพิ่ม/แก้ไขสถานที่ — เลือกพิกัดได้: ค้นหาชื่อ (พิมพ์ไทยได้), ตำแหน่งปัจจุบัน, แตะบนแผนที่, วางลิงก์/พิกัด
import { useEffect, useState } from 'react';
import { db, newUid, type Place, type PlaceKind } from '@/lib/db';
import { appleSearchUrl, appleViewUrl, currentPosition, googleSearchUrl, parseLatLng, searchPlace, viewUrl, type GeoResult } from '@/lib/geo';
import { shrinkImage } from '@/lib/image';
import { activeCountry, dayLabel } from '@/lib/format';
import { Modal } from './ui';
import { MAX_PLACE_PHOTOS, placePhotos } from '@/lib/photos';

interface Props {
  tripUid: string;
  open: boolean;
  hidden: boolean;
  initial: Place | null;
  defaultDay: number;
  days: number;
  tripStart: string;
  picked: { lat: number; lng: number; seq: number } | null;
  onRequestPick: () => void;
  onClose: () => void;
}

export default function PlaceForm({ tripUid, open, hidden, initial, defaultDay, days, tripStart, picked, onRequestPick, onClose }: Props) {
  const [kind, setKind] = useState<PlaceKind>('spot');
  const [day, setDay] = useState(1);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [photos, setPhotos] = useState<Blob[] | undefined>(undefined); // undefined = ไม่เปลี่ยน (ใช้รูปเดิม)
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // รีเซ็ตฟอร์มทุกครั้งที่เปิด
  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? 'spot');
    setDay(initial?.day ?? defaultDay);
    setTitle(initial?.title ?? '');
    setTime(initial?.time ?? '');
    setNote(initial?.note ?? '');
    setBookingCode(initial?.bookingCode ?? '');
    setCheckIn(initial?.checkIn ?? '');
    setLat(initial ? String(initial.lat) : '');
    setLng(initial ? String(initial.lng) : '');
    setPhotos(undefined);
    setQ('');
    setLink('');
    setResults([]);
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // รับพิกัดที่แตะจากแผนที่
  useEffect(() => {
    if (picked) {
      setLat(picked.lat.toFixed(6));
      setLng(picked.lng.toFixed(6));
      setMsg('ปักหมุดตามที่แตะแล้ว');
    }
  }, [picked?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // รูปที่จะบันทึก: แก้แล้วใช้รายการใหม่ ไม่งั้นใช้ของเดิม
  const current = photos ?? (initial ? placePhotos(initial) : []);
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    const u = current.map((b) => URL.createObjectURL(b));
    setThumbs(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, initial]);

  const C = activeCountry();
  const mapName = C.nav === 'apple' ? 'Apple Maps' : 'Google Maps';

  async function doSearch() {
    if (!q.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await searchPlace(q.trim(), C);
      setResults(r);
      if (!r.length) setMsg(`ไม่พบในแอป ลองกดเปิดใน ${mapName} ด้านล่างเพื่อดูชื่อที่ถูกต้อง แล้วพิมพ์ชื่ออังกฤษ/${C.langName} หรือกด “แตะบนแผนที่”`);
    } catch {
      setMsg('ค้นหาไม่ได้ (ต้องมีอินเทอร์เน็ต) — ใช้วิธีอื่นแทนได้');
    }
    setBusy(false);
  }

  function useResult(r: GeoResult) {
    setLat(r.lat.toFixed(6));
    setLng(r.lng.toFixed(6));
    if (!title.trim()) setTitle(q.trim() || r.name); // ใช้ชื่อที่ผู้ใช้พิมพ์ (มักเป็นภาษาไทย)
    setResults([]);
    setMsg(`📍 เลือกแล้ว: ${r.name}`);
  }

  function applyLink() {
    const p = parseLatLng(link);
    if (p) {
      setLat(p.lat.toFixed(6));
      setLng(p.lng.toFixed(6));
      setMsg('ดึงพิกัดจากลิงก์แล้ว');
    } else {
      setMsg('อ่านพิกัดจากลิงก์นี้ไม่ได้ (ลิงก์สั้น maps.app.goo.gl ใช้ไม่ได้ ให้เปิดแล้วคัดลอกลิงก์ยาว)');
    }
  }

  async function useGps() {
    setBusy(true);
    try {
      const p = await currentPosition();
      setLat(p.lat.toFixed(6));
      setLng(p.lng.toFixed(6));
      setMsg('ใช้ตำแหน่งปัจจุบันแล้ว');
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  /** เพิ่มได้ทีละหลายรูป (ย่อก่อนเก็บ ~1000px) สูงสุด MAX_PLACE_PHOTOS รูป */
  async function addPhotos(files?: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PLACE_PHOTOS - current.length;
    if (room <= 0) return setMsg(`ใส่ได้สูงสุด ${MAX_PLACE_PHOTOS} รูปต่อสถานที่`);
    setAdding(true);
    const added: Blob[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try {
        added.push(await shrinkImage(f, 1000, 0.8));
      } catch {
        setMsg('บางรูปใช้ไม่ได้ ข้ามไป');
      }
    }
    if (files.length > room) setMsg(`ใส่ได้สูงสุด ${MAX_PLACE_PHOTOS} รูป — เพิ่มแค่ ${room} รูปแรก`);
    setPhotos([...current, ...added]);
    setAdding(false);
  }

  const removePhoto = (i: number) => setPhotos(current.filter((_, j) => j !== i));
  const makeCover = (i: number) => setPhotos([current[i], ...current.filter((_, j) => j !== i)]);

  async function save() {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!title.trim()) return setMsg('ใส่ชื่อสถานที่ก่อน');
    if (!isFinite(la) || !isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return setMsg('ยังไม่ได้เลือกตำแหน่ง — ค้นหา วางลิงก์ ใช้ตำแหน่งปัจจุบัน หรือแตะบนแผนที่');
    }
    const base = {
      kind,
      day,
      title: title.trim(),
      time: time.trim(),
      note: note.trim(),
      bookingCode: kind === 'hotel' ? bookingCode.trim() : '',
      checkIn: kind === 'hotel' ? checkIn.trim() : '',
      lat: la,
      lng: ln,
    };
    if (initial?.id) {
      const changes: Partial<Place> = { ...base };
      if (photos !== undefined) {
        changes.photos = photos;
        changes.photo = undefined;
      }
      await db.places.update(initial.id, changes);
    } else {
      const same = await db.places.where('tripUid').equals(tripUid).filter((p) => p.day === day).toArray();
      const order = same.length ? Math.max(...same.map((p) => p.order)) + 1 : 0;
      await db.places.add({
        ...base,
        uid: newUid(),
        tripUid,
        order,
        visited: false,
        photos: photos ?? [],
        createdAt: Date.now(),
      });
    }
    onClose();
  }

  async function remove() {
    if (!initial?.id) return;
    if (!confirm(`ลบ “${initial.title}” ใช่ไหม?`)) return;
    await db.places.delete(initial.id);
    onClose();
  }

  return (
    <Modal open={open} hidden={hidden} onClose={onClose} title={initial ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่'}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button className={kind === 'spot' ? 'chip-on' : 'chip'} onClick={() => setKind('spot')}>📍 สถานที่เที่ยว</button>
          <button className={kind === 'hotel' ? 'chip-on' : 'chip'} onClick={() => setKind('hotel')}>🏨 โรงแรม/ที่พัก</button>
        </div>

        <div>
          <label className="label">ชื่อสถานที่</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น คลองโอตารุ" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">วันที่</label>
            <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{dayLabel({ tripStart }, d)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">เวลาที่วางแผน</label>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        {kind === 'hotel' && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ios-blue/10 p-3">
            <div>
              <label className="label">รหัสจอง</label>
              <input className="input" value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} />
            </div>
            <div>
              <label className="label">เวลาเช็กอิน</label>
              <input className="input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} placeholder="เช่น 15:00" />
            </div>
          </div>
        )}

        <div>
          <label className="label">โน้ต</label>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="อยากกินอะไร ต้องจองไหม ฯลฯ" />
        </div>

        <div>
          <label className="label">
            รูปสถานที่ ({current.length}/{MAX_PLACE_PHOTOS}) — เลื่อนดูได้ในป๊อปอัปบนแผนที่ รูปแรกเป็นรูปปก
          </label>
          {thumbs.length > 0 && (
            <div className="hscroll mb-2">
              {thumbs.map((u, i) => (
                <div key={u} className="relative h-24 w-24 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`รูปที่ ${i + 1}`} className="h-full w-full rounded-xl object-cover" />
                  <button
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[13px] text-white"
                    onClick={() => removePhoto(i)}
                    aria-label={`ลบรูปที่ ${i + 1}`}
                  >
                    ✕
                  </button>
                  {i === 0 ? (
                    <span className="absolute bottom-1 left-1 rounded-full bg-ios-blue px-1.5 text-[11px] font-semibold text-white">ปก</span>
                  ) : (
                    <button className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[11px] text-white" onClick={() => makeCover(i)}>
                      ตั้งเป็นปก
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <label className={`btn-ghost cursor-pointer ${current.length >= MAX_PLACE_PHOTOS ? 'pointer-events-none opacity-40' : ''}`}>
            {adding ? 'กำลังเพิ่มรูป…' : '📷 เพิ่มรูป (เลือกได้หลายรูป)'}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>

        <div className="space-y-2 rounded-2xl bg-ios-fill p-3">
          <div className="text-sm font-bold">📌 ตำแหน่งบนแผนที่</div>
          <div className="flex gap-2">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อสถานที่ ภาษาไทยก็ได้" onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
            <button className="btn-primary shrink-0" onClick={doSearch} disabled={busy}>{busy ? 'กำลังหา…' : 'ค้นหา'}</button>
          </div>
          {results.length > 0 && (
            <ul className="divide-y divide-ios-separator rounded-xl bg-ios-card">
              {results.map((r, i) => (
                <li key={i} className="flex items-center gap-2 pr-3">
                  <button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => useResult(r)}>
                    <span className="block truncate text-[15px] font-medium">{r.name}</span>
                    {r.detail && <span className="block truncate text-[12px] text-ios-secondary">{r.detail}</span>}
                  </button>
                  <a
                    className="shrink-0 text-[13px] text-ios-blue"
                    href={C.nav === 'apple' ? appleViewUrl(r.lat, r.lng, r.name) : viewUrl(r.lat, r.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ดูแผนที่
                  </a>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && (
            <a
              className="btn-ghost w-full"
              href={C.nav === 'apple' ? appleSearchUrl(q.trim()) : googleSearchUrl(q.trim())}
              target="_blank"
              rel="noopener noreferrer"
            >
              🔎 เปิดค้นหา “{q.trim()}” ใน {mapName}
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={useGps} disabled={busy}>🎯 ตำแหน่งปัจจุบัน</button>
            <button className="btn-ghost" onClick={onRequestPick}>🗺️ แตะบนแผนที่</button>
          </div>
          <details>
            <summary className="cursor-pointer px-1 py-1 text-[13px] text-ios-secondary">วิธีอื่น: วางลิงก์หรือใส่พิกัดเอง</summary>
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="วางลิงก์ Google Maps / พิกัด" />
                <button className="btn-ghost shrink-0" onClick={applyLink}>ใช้ลิงก์</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">ละติจูด</label>
                  <input className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div>
                  <label className="label">ลองจิจูด</label>
                  <input className="input" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
            </div>
          </details>
        </div>

        {msg && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{msg}</p>}

        <div className="flex gap-2">
          {initial && <button className="btn-danger" onClick={remove}>🗑️ ลบ</button>}
          <button className="btn-primary flex-1 !py-3 text-base" onClick={save}>💾 บันทึก</button>
        </div>
      </div>
    </Modal>
  );
}
