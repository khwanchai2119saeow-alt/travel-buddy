'use client';
// นำเข้าแผนเที่ยวจากไฟล์ CSV: เลือกไฟล์/วางข้อความ → ดูตัวอย่าง → หาพิกัดที่ขาด → นำเข้า
import { useState } from 'react';
import { db, newUid, type Place, type Settings } from '@/lib/db';
import { readPlanCsv, templateCsv, exportPlanCsv, type CsvRow } from '@/lib/csv';
import { geocodeIn } from '@/lib/geo';
import { countryOf } from '@/lib/country';
import { dayLabel, ymd } from '@/lib/format';
import { downloadBlob } from '@/lib/image';
import { Modal } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  places: Place[];
}

const ready = (r: CsvRow) => r.problems.length === 0 && !r.duplicate && r.lat != null && r.lng != null;

export default function CsvImport({ open, onClose, settings, places }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [geo, setGeo] = useState<{ done: number; total: number } | null>(null);
  const [includeDup, setIncludeDup] = useState(false);

  function reset() {
    setRows([]);
    setText('');
    setMsg('');
    setGeo(null);
    setIncludeDup(false);
  }

  function close() {
    if (geo) return; // กำลังค้นหาพิกัดอยู่ รอให้เสร็จก่อน
    reset();
    onClose();
  }

  function read(src: string) {
    const r = readPlanCsv(src, { tripStart: settings.tripStart, days: settings.days, existing: places });
    setRows(r.rows);
    setMsg(r.error ?? '');
  }

  async function onFile(f?: File | null) {
    if (!f) return;
    read(await f.text());
  }

  const missing = rows.filter((r) => r.problems.length === 0 && r.lat == null && (includeDup || !r.duplicate));

  async function findCoords() {
    setGeo({ done: 0, total: missing.length });
    let found = 0;
    const next = [...rows];
    for (let i = 0; i < missing.length; i++) {
      const target = missing[i];
      try {
        const hit = await geocodeIn(target.title, countryOf(settings.country).geoCode);
        if (hit) {
          const idx = next.findIndex((r) => r.line === target.line);
          next[idx] = { ...next[idx], lat: hit.lat, lng: hit.lng, geocoded: true };
          found++;
          setRows([...next]);
        }
      } catch {
        setMsg('ค้นหาพิกัดไม่ได้ (ต้องมีอินเทอร์เน็ต)');
        break;
      }
      setGeo({ done: i + 1, total: missing.length });
      if (i < missing.length - 1) await new Promise((r) => setTimeout(r, 1100)); // Nominatim: ไม่เกิน 1 ครั้ง/วินาที
    }
    setGeo(null);
    setMsg(`เจอพิกัด ${found} จาก ${missing.length} แห่ง${found < missing.length ? ' — ที่ไม่เจอจะไม่ถูกนำเข้า ลองใส่ลิงก์ Google Maps ในไฟล์ หรือเพิ่มเองด้วยปุ่ม “＋ เพิ่มที่”' : ''}`);
  }

  const toImport = rows.filter((r) => r.problems.length === 0 && r.lat != null && (includeDup || !r.duplicate));

  async function doImport() {
    const orderByDay = new Map<number, number>();
    for (const p of places) orderByDay.set(p.day, Math.max(orderByDay.get(p.day) ?? -1, p.order));
    const now = Date.now();
    await db.places.bulkAdd(
      toImport.map((r, i) => {
        const order = (orderByDay.get(r.day) ?? -1) + 1;
        orderByDay.set(r.day, order);
        return {
          uid: newUid(),
          tripUid: settings.uid,
          day: r.day,
          order,
          kind: r.kind,
          title: r.title,
          lat: r.lat!,
          lng: r.lng!,
          note: r.note,
          time: r.time,
          bookingCode: r.bookingCode,
          checkIn: r.checkIn,
          visited: false,
          createdAt: now + i,
        };
      }),
    );
    const n = toImport.length;
    reset();
    setMsg(`นำเข้าแล้ว ${n} แห่ง`);
  }

  return (
    <Modal open={open} onClose={close} title="นำเข้าแผนเที่ยวจาก CSV">
      <div className="space-y-4">
        {rows.length === 0 && (
          <>
            <p className="text-sm text-ios-secondary">
              ทำตารางใน Numbers หรือ Google Sheets แล้วส่งออกเป็น CSV ต้องมีคอลัมน์ <b>วัน</b> กับ <b>ชื่อ</b> ส่วนพิกัดใส่เป็น
              ละติจูด/ลองจิจูด หรือวางลิงก์ Google Maps ก็ได้ (ไม่มีพิกัด แอปค้นหาให้ได้)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="btn-primary cursor-pointer">
                เลือกไฟล์ CSV
                <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <button className="btn-ghost" onClick={() => downloadBlob(templateCsv(), 'แม่แบบแผนเที่ยว.csv')}>
                ดาวน์โหลดแม่แบบ
              </button>
            </div>
            <div className="space-y-2">
              <label className="label">หรือคัดลอกตารางมาวางที่นี่</label>
              <textarea className="input font-mono text-xs" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'วัน,ชื่อ,เวลา\n1,สวนโอโดริ,16:00'} />
              <button className="btn-ghost w-full" onClick={() => read(text)} disabled={!text.trim()}>
                อ่านข้อความที่วาง
              </button>
            </div>
            {places.length > 0 && (
              <button className="w-full text-center text-sm text-ios-blue" onClick={() => downloadBlob(exportPlanCsv(places), `แผนเที่ยว-${ymd(new Date())}.csv`)}>
                ส่งออกแผนปัจจุบันเป็น CSV ({places.length} แห่ง)
              </button>
            )}
          </>
        )}

        {msg && <p className="rounded-xl bg-ios-fill p-3 text-sm">{msg}</p>}

        {rows.length > 0 && (
          <>
            <div className="ios-list">
              {rows.map((r) => {
                const ok = ready(r) || (includeDup && r.duplicate && r.problems.length === 0 && r.lat != null);
                return (
                  <div key={r.line} className="ios-row items-start">
                    <span className="mt-0.5 text-base">{ok ? '✅' : r.problems.length ? '⛔️' : r.duplicate ? '♻️' : '📍'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {r.kind === 'hotel' ? '🏨 ' : ''}
                        {r.title || '(ไม่มีชื่อ)'}
                      </div>
                      <div className="text-xs text-ios-secondary">
                        บรรทัด {r.line}
                        {r.day ? ` · ${dayLabel(settings, r.day)}` : ''}
                        {r.time ? ` · ${r.time} น.` : ''}
                        {r.lat != null ? (r.geocoded ? ' · พิกัดจากการค้นหา (ตรวจอีกครั้ง)' : ' · มีพิกัด') : r.problems.length ? '' : ' · ยังไม่มีพิกัด'}
                      </div>
                      {r.problems.length > 0 && <div className="text-xs text-ios-red">{r.problems.join(' · ')}</div>}
                      {r.duplicate && <div className="text-xs text-ios-orange">มีชื่อนี้ในวันเดียวกันอยู่แล้ว</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {rows.some((r) => r.duplicate) && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} />
                นำเข้ารายการที่ซ้ำด้วย
              </label>
            )}

            {missing.length > 0 && (
              <button className="btn-ghost w-full" onClick={findCoords} disabled={!!geo}>
                {geo ? `กำลังค้นหาพิกัด ${geo.done}/${geo.total}…` : `ค้นหาพิกัดที่ขาด ${missing.length} แห่ง (ต้องมีเน็ต)`}
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={reset} disabled={!!geo}>
                เริ่มใหม่
              </button>
              <button className="btn-primary" onClick={doImport} disabled={!!geo || toImport.length === 0}>
                นำเข้า {toImport.length} แห่ง
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
