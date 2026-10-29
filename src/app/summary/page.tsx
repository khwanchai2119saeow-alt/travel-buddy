'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '@/lib/db';
import { DAY_CATS, preCat, PRE_CATS } from '@/lib/constants';
import { useStats, useTripPlaces } from '@/lib/stats';
import { countryOf } from '@/lib/country';
import { computePeople } from '@/lib/people';
import { placePhotos } from '@/lib/photos';
import { dayDate, dayLabel, fmtCur, fmtThb, fmtThb0 } from '@/lib/format';
import { downloadBlob, shareFile } from '@/lib/image';
import { PageHeader, useBlobUrl } from '@/components/ui';
import DailyChart from '@/components/DailyChart';

function Thumb({ blob }: { blob?: Blob }) {
  const url = useBlobUrl(blob);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />;
}

export default function SummaryPage() {
  const { stats, settings, pre, daily } = useStats();
  const allPlaces = useTripPlaces(settings.uid) ?? [];
  const C = countryOf(settings.country);
  const people = computePeople(settings, pre, daily, stats.rate);
  const isSplit = settings.splitMode === 'split';
  const recapRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<'visited' | 'all' | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare('share' in navigator), []);

  const visitedCount = allPlaces.filter((p) => p.visited).length;
  const effScope = scope ?? (visitedCount > 0 ? 'visited' : 'all');

  const byDay = useMemo(() => {
    const list = [...allPlaces]
      .filter((p) => effScope === 'all' || p.visited)
      .sort((a, b) => a.day - b.day || a.order - b.order || a.createdAt - b.createdAt);
    const m = new Map<number, Place[]>();
    for (const p of list) m.set(p.day, [...(m.get(p.day) ?? []), p]);
    return Array.from(m.entries());
  }, [allPlaces, effScope]);

  const first = dayDate(settings, 1);
  const last = dayDate(settings, settings.days);
  const range =
    first && last
      ? `${first.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} – ${last.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${settings.days} วัน`;

  async function renderCanvas(): Promise<HTMLCanvasElement> {
    const html2canvas = (await import('html2canvas')).default;
    if (!recapRef.current) throw new Error('ไม่พบเนื้อหา');
    return html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  }

  async function asPng(): Promise<Blob> {
    const canvas = await renderCanvas();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('สร้างรูปไม่สำเร็จ');
    return blob;
  }

  async function savePng() {
    setBusy('image');
    setMsg('');
    try {
      downloadBlob(await asPng(), `สรุปทริป-${settings.name}.png`);
      setMsg('บันทึกรูปแล้ว (ดูในโฟลเดอร์ดาวน์โหลด/ไฟล์) — บน iPhone ใช้ปุ่ม “แชร์” แล้วเลือก “บันทึกรูปภาพ” จะลงอัลบั้มโดยตรง');
    } catch (e) {
      setMsg('สร้างรูปไม่สำเร็จ: ' + (e as Error).message);
    }
    setBusy('');
  }

  async function sharePng() {
    setBusy('share');
    setMsg('');
    try {
      const blob = await asPng();
      const file = new File([blob], `สรุปทริป-${settings.name}.png`, { type: 'image/png' });
      const ok = await shareFile(file, `สรุปทริป${settings.name}`);
      if (!ok) {
        downloadBlob(blob, file.name);
        setMsg('เครื่องนี้แชร์ไฟล์ตรง ๆ ไม่ได้ จึงบันทึกเป็นไฟล์ให้แทน');
      }
    } catch (e) {
      setMsg('แชร์ไม่สำเร็จ: ' + (e as Error).message);
    }
    setBusy('');
  }

  async function savePdf() {
    setBusy('pdf');
    setMsg('');
    try {
      const { jsPDF } = await import('jspdf');
      const canvas = await renderCanvas();
      const img = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ih = (canvas.height * pw) / canvas.width;
      let left = ih;
      let pos = 0;
      pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
      left -= ph;
      while (left > 0) {
        pos -= ph;
        pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
        left -= ph;
      }
      downloadBlob(pdf.output('blob'), `สรุปทริป-${settings.name}.pdf`);
      setMsg('บันทึก PDF แล้ว');
    } catch (e) {
      setMsg('สร้าง PDF ไม่สำเร็จ: ' + (e as Error).message);
    }
    setBusy('');
  }

  return (
    <>
      <PageHeader back="/" title="สรุปทริป" subtitle="บันทึกเป็นรูปหรือ PDF เก็บไว้/ส่งให้เพื่อน" />
      <section className="space-y-3 p-4">
        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ios-secondary">แสดงในแผนเที่ยว:</span>
            <button className={effScope === 'visited' ? 'chip-on' : 'chip'} onClick={() => setScope('visited')}>เฉพาะที่ไปแล้ว ({visitedCount})</button>
            <button className={effScope === 'all' ? 'chip-on' : 'chip'} onClick={() => setScope('all')}>ทั้งหมด</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-primary" onClick={savePng} disabled={!!busy}>{busy === 'image' ? 'รอสักครู่…' : '🖼️ บันทึกรูป'}</button>
            <button className="btn-ghost" onClick={savePdf} disabled={!!busy}>{busy === 'pdf' ? 'รอสักครู่…' : '📄 PDF'}</button>
            {canShare ? (
              <button className="btn-ghost" onClick={sharePng} disabled={!!busy}>{busy === 'share' ? 'รอสักครู่…' : '📤 แชร์'}</button>
            ) : (
              <span />
            )}
          </div>
          {msg && <p className="rounded-xl bg-ios-blue/10 p-2 text-xs text-ios-blue">{msg}</p>}
        </div>

        {/* ---------- ส่วนที่จะถูกแคปเป็นรูป/PDF ---------- */}
        <div ref={recapRef} style={{ background: '#ffffff', borderRadius: 16, padding: 16 }}>
          <div style={{ background: '#0f2a43', color: '#fff', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#bae6fd' }}>สรุปทริป</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{C.flag} {settings.name} · {C.name}</div>
            <div style={{ fontSize: 12, color: '#bae6fd', marginTop: 2 }}>{range} · {settings.members.map((m) => m.name).join(', ')}</div>
          </div>

          <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>ค่าใช้จ่ายรวมทั้งทริป</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#e11d48' }}>{fmtThb(stats.grandThb)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>ส่วนที่ 1 · จ่ายล่วงหน้า</div>
                <div style={{ fontWeight: 700 }}>{fmtThb0(stats.preTotalThb)}</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>ส่วนที่ 2 · ที่{C.name}</div>
                <div style={{ fontWeight: 700 }}>{fmtCur(stats.tripTotalJpy)}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>≈ {fmtThb0(stats.tripTotalThb)} (เรท {fmtCur(C.rateUnit)} = ฿{(stats.rate * C.rateUnit).toFixed(2)})</div>
              </div>
            </div>
            {PRE_CATS.some((c) => pre.some((p) => p.category === c.key)) && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                {PRE_CATS.map((c) => {
                  const v = pre.filter((p) => p.category === c.key).reduce((a, p) => a + p.thb, 0);
                  return v > 0 ? (
                    <span key={c.key} style={{ marginRight: 10 }}>
                      {preCat(c.key).emoji} {c.label} {fmtThb0(v)}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {settings.members.length > 1 && (
            <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                👥 สรุปรายคน ({isSplit ? 'หารกัน' : 'กระเป๋าเงินร่วม'})
              </div>
              {people.people.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '22px' }}>
                  <span>
                    {p.name} · จ่ายไป {fmtThb0(p.paidThb)}
                    {isSplit ? ` · ส่วนของตัวเอง ${fmtThb0(p.shareThb)}` : ''}
                  </span>
                  {isSplit && (
                    <span style={{ fontWeight: 700, color: p.balance > 0.5 ? '#16a34a' : p.balance < -0.5 ? '#dc2626' : '#64748b' }}>
                      {p.balance > 0.5 ? `ได้คืน ${fmtThb0(p.balance)}` : p.balance < -0.5 ? `ต้องจ่าย ${fmtThb0(-p.balance)}` : 'พอดี'}
                    </span>
                  )}
                </div>
              ))}
              {isSplit && people.transfers.length > 0 && (
                <div style={{ marginTop: 8, background: '#f0fdf4', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>💸 เคลียร์เงิน</div>
                  {people.transfers.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: '22px' }}>
                      {t.from.name} → โอนให้ {t.to.name} <b>{fmtThb0(t.thb)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>ใช้จ่ายรายวัน ({C.curName})</div>
            <DailyChart perDay={stats.perDay} unit="jpy" rate={stats.rate} />
            <div style={{ marginTop: 8 }}>
              {DAY_CATS.map((c) => {
                const v = stats.byCat[c.key];
                const pct = stats.tripTotalJpy > 0 ? (v / stats.tripTotalJpy) * 100 : 0;
                return (
                  <div key={c.key} style={{ marginBottom: 6 }}>
                    {/* lineHeight/marginTop ตายตัว: html2canvas วาดตัวอักษรไทยต่ำกว่าบนจอเล็กน้อย ถ้าไม่เว้นจะทับแถบสี */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '20px' }}>
                      <span>{c.emoji} {c.label}</span>
                      <span style={{ fontWeight: 600 }}>{fmtCur(v)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 7, marginTop: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              แผนเที่ยว {effScope === 'visited' ? '(เฉพาะที่ไปแล้ว)' : '(ทั้งหมด)'}
            </div>
            {byDay.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>ยังไม่มีสถานที่ให้แสดง</div>}
            {byDay.map(([d, list]) => (
              <div key={d} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#0f2a43', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 5 }}>
                  <span>{dayLabel(settings, d)}</span>
                  <span style={{ color: '#e11d48' }}>{fmtCur(stats.perDay[d - 1]?.jpy ?? 0)}</span>
                </div>
                {list.map((p) => (
                  <div key={p.uid} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                    <Thumb blob={placePhotos(p)[0]} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {p.kind === 'hotel' ? '🏨' : p.visited ? '✅' : '📍'} {p.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {p.time ? `${p.time} น.` : ''}
                        {p.kind === 'hotel' && p.bookingCode ? ` · รหัสจอง ${p.bookingCode}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>สร้างด้วยแอปผู้ช่วยเที่ยว</div>
        </div>
      </section>
    </>
  );
}
