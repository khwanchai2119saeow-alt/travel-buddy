'use client';
import { useEffect, useState } from 'react';
import { newUid, requestPersistentStorage, saveSettings } from '@/lib/db';
import { effectiveRate, useSettings } from '@/lib/stats';
import { exportAll, importMerge, wipeAll } from '@/lib/backup';
import { downloadBlob, shareFile } from '@/lib/image';
import { fmtCur, fmtThb, ymd } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import Link from 'next/link';
import { countryOf } from '@/lib/country';
import MembersEditor from '@/components/MembersEditor';

/** ช่องตัวเลข/ข้อความที่พิมพ์ได้ลื่น แล้วค่อยบันทึกตอนออกจากช่อง */
function Field({
  label,
  value,
  onCommit,
  type = 'text',
  inputMode,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  type?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  hint?: string;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return (
    <div>
      <label className="label">{label}</label>
      {multiline ? (
        <textarea className="input" rows={4} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      ) : (
        <input
          className="input"
          type={type}
          inputMode={inputMode}
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            // ช่องวันที่เลือกจากปฏิทิน → บันทึกทันที (บางเบราว์เซอร์มือถือไม่ยิง blur หลังเลือกวัน)
            if (type === 'date' && e.target.value !== value) onCommit(e.target.value);
          }}
          onBlur={commit}
        />
      )}
      {hint && <p className="mt-1 text-[11px] text-ios-secondary">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const rate = effectiveRate(s);
  const C = countryOf(s.country);

  const [lotJpy, setLotJpy] = useState('');
  const [lotThb, setLotThb] = useState('');
  const [lotNote, setLotNote] = useState('');
  const [msg, setMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [storage, setStorage] = useState('');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare('share' in navigator);
    refreshStorage();
  }, []);

  async function refreshStorage() {
    try {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      const used = est?.usage ? (est.usage / 1024 / 1024).toFixed(1) : '?';
      setStorage(`${persisted ? '✅ เบราว์เซอร์รับปากเก็บข้อมูลถาวรแล้ว' : '⚠️ ยังไม่ได้รับสิทธิ์เก็บถาวร'} · ใช้พื้นที่ ${used} MB`);
    } catch {
      setStorage('');
    }
  }

  async function addLot() {
    const jpy = parseFloat(lotJpy.replace(/,/g, ''));
    const thb = parseFloat(lotThb.replace(/,/g, ''));
    if (!(jpy > 0) || !(thb > 0)) return setMsg(`ใส่ทั้งจำนวน${C.curName}ที่ได้ และจำนวนบาทที่จ่าย`);
    await saveSettings({
      rateLots: [...s.rateLots, { id: newUid(), jpy, thb, note: lotNote.trim() }],
      rateMode: 'lots',
    });
    setLotJpy('');
    setLotThb('');
    setLotNote('');
    setMsg('');
  }

  async function removeLot(id: string) {
    if (!confirm('ลบล็อตแลกเงินนี้?')) return;
    await saveSettings({ rateLots: s.rateLots.filter((l) => l.id !== id) });
  }

  async function doExport(share: boolean) {
    setBackupMsg('กำลังสร้างไฟล์สำรอง…');
    try {
      const blob = await exportAll();
      const name = `hokkaido-trip-backup-${ymd(new Date())}.json`;
      if (share) {
        const ok = await shareFile(new File([blob], name, { type: 'application/json' }), 'ไฟล์สำรองข้อมูลทริป');
        if (!ok) downloadBlob(blob, name);
      } else {
        downloadBlob(blob, name);
      }
      setBackupMsg('สร้างไฟล์สำรองแล้ว ส่งให้อีกเครื่อง/เก็บไว้ใน LINE Keep หรือ Google Drive ได้');
    } catch (e) {
      setBackupMsg('สำรองไม่สำเร็จ: ' + (e as Error).message);
    }
  }

  async function doImport(file?: File | null) {
    if (!file) return;
    setBackupMsg('กำลังรวมข้อมูล…');
    try {
      const r = await importMerge(await file.text(), { overwriteSettings: overwrite });
      setBackupMsg(`รวมข้อมูลแล้ว: ทริป +${r.trips} · ค่าใช้จ่ายล่วงหน้า +${r.pre} · ค่าใช้จ่ายรายวัน +${r.daily} · สถานที่ +${r.places} · ล็อตแลกเงิน +${r.lots} · สมาชิก +${r.members} · อัปเดตตามที่แก้ ${r.updated} (รายการที่มีอยู่แล้วไม่ถูกเพิ่มซ้ำ)`);
    } catch (e) {
      setBackupMsg((e as Error).message);
    }
  }

  async function doWipe() {
    if (!confirm('ลบข้อมูลทั้งหมดในเครื่องนี้ (ค่าใช้จ่าย แผนเที่ยว ตั้งค่า)? ย้อนกลับไม่ได้')) return;
    if (!confirm('ยืนยันอีกครั้ง — แนะนำให้กดสำรองข้อมูลก่อน ต้องการลบจริงไหม?')) return;
    await wipeAll();
    setBackupMsg('ล้างข้อมูลทั้งหมดแล้ว');
  }

  return (
    <>
      <PageHeader back="/" title="ตั้งค่า" subtitle="เรทแลกเงิน · ทริป · สำรองข้อมูล" />
      <section className="space-y-3 p-4">
        {/* ---- ทริป ---- */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">
              {C.flag} ทริปที่เปิดอยู่
            </h2>
            <Link href="/trips/" className="text-[15px] text-ios-blue">
              ทริปทั้งหมด ›
            </Link>
          </div>
          <Field label="ชื่อทริป" value={s.name} onCommit={(v) => saveSettings({ name: v.trim() || C.centerName })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="วันเริ่มเดินทาง" type="date" value={s.tripStart} onCommit={(v) => saveSettings({ tripStart: v })} />
            <Field
              label="วันกลับ"
              type="date"
              value={s.tripStart ? endOf(s.tripStart, s.days) : ''}
              onCommit={(v) => {
                if (!s.tripStart || !v) return;
                const n = Math.round((new Date(v + 'T00:00:00').getTime() - new Date(s.tripStart + 'T00:00:00').getTime()) / 86400000) + 1;
                if (n >= 1 && n <= 60) saveSettings({ days: n });
              }}
            />
          </div>
          <p className="px-1 text-[12px] text-ios-secondary">{s.tripStart ? `รวม ${s.days} วัน` : 'ตั้งวันเริ่มเดินทางก่อน แล้วค่อยเลือกวันกลับ'}</p>
        </div>

        {/* ---- สมาชิก ---- */}
        <div className="card space-y-3">
          <h2 className="text-sm font-bold">👥 เพื่อนร่วมทริป ({s.members.length} คน)</h2>
          <MembersEditor s={s} />
        </div>

        <div className="card space-y-2">
          <Field label="ชื่อของฉัน (ใช้ทักทายในหน้าแรก และเป็นชื่อเริ่มต้นตอนสร้างทริปใหม่)" value={s.nameA} onCommit={(v) => saveSettings({ nameA: v.trim() || 'ฉัน' })} />
        </div>

        {/* ---- เรท ---- */}
        <div className="card space-y-3">
          <h2 className="text-sm font-bold">💱 เรทแลกเงินของทริปนี้ ({C.curName} → บาท)</h2>
          <div className="segmented grid-cols-2">
            <button className={s.rateMode === 'fixed' ? 'seg-on' : 'seg'} onClick={() => saveSettings({ rateMode: 'fixed' })}>
              ตั้งเรทเอง (คงที่)
            </button>
            <button className={s.rateMode === 'lots' ? 'seg-on' : 'seg'} onClick={() => saveSettings({ rateMode: 'lots' })}>
              เฉลี่ยจากล็อตที่แลก
            </button>
          </div>

          {s.rateMode === 'fixed' ? (
            <Field
              label={`${C.rateUnit} ${C.curName} = กี่บาท`}
              inputMode="decimal"
              value={(s.fixedRate * C.rateUnit).toFixed(2)}
              hint={`ใส่เรทที่ตรงกับบัตร Travel Card / เงินสดที่แลกไว้ เช่น ${(C.defaultRate * C.rateUnit).toFixed(2)} (แอปจะใช้เรทนี้คิดทุกรายการของทริปนี้)`}
              onCommit={(v) => {
                const n = parseFloat(v.replace(/,/g, ''));
                if (n > 0) saveSettings({ fixedRate: n / C.rateUnit });
              }}
            />
          ) : (
            <p className="text-xs text-ios-secondary">เรทที่ใช้ = บาททั้งหมดที่จ่าย ÷ {C.curName}ทั้งหมดที่ได้ จากทุกล็อตด้านล่าง (ถ่วงน้ำหนักตามจำนวนเงิน)</p>
          )}

          <div className="rounded-2xl bg-ios-red/10 p-3 text-center">
            <div className="text-xs text-ios-red">เรทที่แอปกำลังใช้</div>
            <div className="text-2xl font-bold text-ios-red">
              {fmtCur(C.rateUnit)} = ฿{(rate * C.rateUnit).toFixed(2)}
            </div>
            <div className="text-xs text-ios-red">{fmtCur(1)} = ฿{rate.toFixed(4)}</div>
          </div>

          <div className="space-y-2 rounded-2xl bg-ios-fill p-3">
            <div className="text-sm font-bold">🏦 ล็อตการแลกเงิน {s.rateMode === 'fixed' && <span className="text-[11px] font-normal text-ios-secondary">(ใช้ติดตามยอด{C.curName}คงเหลือ)</span>}</div>
            {s.rateLots.length === 0 && <p className="text-xs text-ios-secondary">ยังไม่มีล็อต เช่น แลกเงินสดครั้งที่ 1, เติมบัตร Travel Card</p>}
            <ul className="space-y-1">
              {s.rateLots.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-ios-card px-3 py-2 text-sm ring-1 ring-ios-separator">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {fmtCur(l.jpy)} ← {fmtThb(l.thb)}
                    </div>
                    <div className="truncate text-xs text-ios-secondary">
                      {fmtCur(C.rateUnit)} = ฿{((l.thb / l.jpy) * C.rateUnit).toFixed(2)}
                      {l.note ? ` · ${l.note}` : ''}
                    </div>
                  </div>
                  <button className="rounded-lg bg-ios-red/10 px-2 py-1 text-xs" onClick={() => removeLot(l.id)} aria-label="ลบล็อต">🗑️</button>
                </li>
              ))}
            </ul>
            {s.rateLots.length > 0 && (
              <p className="text-xs text-ios-secondary">
                รวมแลกไว้ {fmtCur(s.rateLots.reduce((a, l) => a + l.jpy, 0))} จ่ายไป {fmtThb(s.rateLots.reduce((a, l) => a + l.thb, 0))}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="decimal" placeholder={`ได้${C.curName} (${C.sym})`} value={lotJpy} onChange={(e) => setLotJpy(e.target.value)} />
              <input className="input" inputMode="decimal" placeholder="จ่ายบาท (฿)" value={lotThb} onChange={(e) => setLotThb(e.target.value)} />
            </div>
            <input className="input" placeholder="โน้ต เช่น เงินสด / บัตร Travel Card" value={lotNote} onChange={(e) => setLotNote(e.target.value)} />
            {msg && <p className="text-xs text-ios-orange">{msg}</p>}
            <button className="btn-primary w-full" onClick={addLot}>＋ เพิ่มล็อตแลกเงิน</button>
          </div>
        </div>

        {/* ---- ข้อมูลสำคัญ ---- */}
        <div className="card space-y-2">
          <h2 className="text-sm font-bold">📝 ข้อมูลสำคัญของฉัน</h2>
          <Field
            label="เลขกรมธรรม์ประกัน / เบอร์สถานทูต / เบอร์บัตรที่ต้องแจ้งอายัด ฯลฯ"
            multiline
            value={s.notes}
            onCommit={(v) => saveSettings({ notes: v })}
            hint="จะแสดงที่หน้าแรก ใช้ออฟไลน์ได้ — อย่าใส่เลขบัตรเครดิต/รหัสผ่านเต็ม ๆ ในที่นี้"
          />
        </div>

        {/* ---- สำรองข้อมูล ---- */}
        <div className="card space-y-3">
          <h2 className="text-sm font-bold">💾 สำรอง / รวมข้อมูล 2 เครื่อง</h2>
          <p className="text-xs text-ios-secondary">
            ข้อมูลอยู่ในเครื่องนี้เท่านั้น แนะนำสำรองทุกคืนหลังจดรายจ่าย หรือส่งไฟล์ให้อีกเครื่องเพื่อรวมรายการ (ไม่ซ้ำ)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => doExport(false)}>⬇️ สำรองทุกทริป</button>
            {canShare ? (
              <button className="btn-ghost" onClick={() => doExport(true)}>📤 ส่งทาง LINE/แอปอื่น</button>
            ) : (
              <span />
            )}
          </div>
          <label className="btn-ghost w-full cursor-pointer">
            ⬆️ นำเข้า / รวมจากไฟล์สำรอง
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <label className="flex items-center gap-2 text-xs text-ios-secondary">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            ใช้ค่าตั้งค่า (เรท ชื่อ วันเดินทาง) จากไฟล์ด้วย — ปกติไม่ต้องติ๊ก
          </label>
          {backupMsg && <p className="rounded-xl bg-ios-blue/10 p-2 text-xs text-ios-blue">{backupMsg}</p>}
        </div>

        {/* ---- พื้นที่เก็บข้อมูล ---- */}
        <div className="card space-y-2">
          <h2 className="text-sm font-bold">🗄️ พื้นที่เก็บข้อมูลในเครื่อง</h2>
          {storage && <p className="text-xs text-ios-secondary">{storage}</p>}
          <button className="btn-ghost w-full" onClick={async () => { await requestPersistentStorage(); refreshStorage(); }}>
            ขอให้เก็บข้อมูลถาวร
          </button>
          <p className="text-[11px] text-ios-secondary">iPhone: ควรเพิ่มแอปลงหน้าจอโฮม (Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม) ไม่งั้นระบบอาจล้างข้อมูลถ้าไม่ได้เปิดใช้นานหลายวัน</p>
        </div>

        <button className="btn-danger w-full" onClick={doWipe}>🗑️ ล้างข้อมูลทั้งหมดในเครื่องนี้</button>
      </section>
    </>
  );
}

/** วันสุดท้ายของทริป (YYYY-MM-DD) */
function endOf(start: string, days: number): string {
  const d = new Date(start + 'T00:00:00');
  d.setDate(d.getDate() + days - 1);
  return ymd(d);
}
