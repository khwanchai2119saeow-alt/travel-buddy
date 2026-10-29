'use client';
// ฟอร์มเพิ่ม/แก้ไขสถานที่ — เลือกพิกัดได้ 4 วิธี: ค้นหาชื่อ, วางลิงก์ Google Maps, ตำแหน่งปัจจุบัน, แตะบนแผนที่
import { useEffect, useState } from 'react';
import { db, newUid, type Place, type PlaceKind } from '@/lib/db';
import { currentPosition, parseLatLng, searchPlace, type GeoResult } from '@/lib/geo';
import { shrinkImage } from '@/lib/image';
import { activeCountry, dayLabel } from '@/lib/format';
import { Modal, useBlobUrl } from './ui';

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
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined); // undefined = ไม่เปลี่ยน, null = ลบ
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
    setPhoto(undefined);
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

  const previewBlob = photo === undefined ? initial?.photo : photo ?? undefined;
  const previewUrl = useBlobUrl(previewBlob);

  async function doSearch() {
    if (!q.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await searchPlace(q.trim());
      setResults(r);
      if (!r.length) setMsg(`ไม่พบสถานที่ ลองพิมพ์เป็นภาษาอังกฤษหรือภาษา${activeCountry().langName}`);
    } catch {
      setMsg('ค้นหาไม่ได้ (ต้องมีอินเทอร์เน็ต) — ใช้วิธีอื่นแทนได้');
    }
    setBusy(false);
  }

  function useResult(r: GeoResult) {
    setLat(r.lat.toFixed(6));
    setLng(r.lng.toFixed(6));
    if (!title.trim()) setTitle(r.name.split(',')[0]);
    setResults([]);
    setMsg('เลือกตำแหน่งแล้ว');
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

  async function onPhoto(file?: File | null) {
    if (!file) return;
    try {
      setPhoto(await shrinkImage(file, 1000, 0.8));
    } catch {
      setMsg('ใช้รูปนี้ไม่ได้');
    }
  }

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
      if (photo !== undefined) changes.photo = photo ?? undefined;
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
        photo: photo ?? undefined,
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
          <label className="label">รูปตัวอย่าง (จะโชว์ในป๊อปอัปบนแผนที่)</label>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="ตัวอย่างรูป" className="mb-2 h-36 w-full rounded-2xl object-cover" />
          )}
          <div className="flex gap-2">
            <label className="btn-ghost cursor-pointer">
              📷 เลือก/ถ่ายรูป
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            {previewUrl && <button className="btn-ghost" onClick={() => setPhoto(null)}>ลบรูป</button>}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-ios-fill p-3">
          <div className="text-sm font-bold">📌 ตำแหน่งบนแผนที่</div>
          <div className="flex gap-2">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อสถานที่ (ต้องมีเน็ต)" onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
            <button className="btn-primary shrink-0" onClick={doSearch} disabled={busy}>ค้นหา</button>
          </div>
          {results.length > 0 && (
            <ul className="divide-y rounded-xl bg-ios-card ring-1 ring-ios-separator">
              {results.map((r, i) => (
                <li key={i}>
                  <button className="w-full px-3 py-2 text-left text-sm" onClick={() => useResult(r)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="วางลิงก์ Google Maps / พิกัด" />
            <button className="btn-ghost shrink-0" onClick={applyLink}>ใช้ลิงก์</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={useGps} disabled={busy}>🎯 ตำแหน่งปัจจุบัน</button>
            <button className="btn-ghost" onClick={onRequestPick}>🗺️ แตะบนแผนที่</button>
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

        {msg && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{msg}</p>}

        <div className="flex gap-2">
          {initial && <button className="btn-danger" onClick={remove}>🗑️ ลบ</button>}
          <button className="btn-primary flex-1 !py-3 text-base" onClick={save}>💾 บันทึก</button>
        </div>
      </div>
    </Modal>
  );
}
