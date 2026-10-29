'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, newUid, type DayCategory } from '@/lib/db';
import { DAY_CATS } from '@/lib/constants';
import { useStats } from '@/lib/stats';
import { dayLabel, fmtCur, fmtThb, todayDay } from '@/lib/format';
import { prepareForOcr, shrinkImage } from '@/lib/image';
import { recognize, statusTh } from '@/lib/ocr';
import { guessReceipt, parseItems, type ReceiptItem } from '@/lib/receipt';
import { glossItem, guessCategory } from '@/lib/receiptWords';
import { myMemory } from '@/lib/translate';
import { countryOf } from '@/lib/country';
import { PageHeader, useBlobUrl } from '@/components/ui';

export default function ScanPage() {
  const { stats, settings } = useStats();
  const C = countryOf(settings.country);
  const [file, setFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ status: '', pct: 0 });
  const [raw, setRaw] = useState('');
  const [candidates, setCandidates] = useState<number[]>([]);
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(1);
  const [category, setCategory] = useState<DayCategory>('shopping');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [online, setOnline] = useState<Record<string, string>>({}); // ชื่อญี่ปุ่น → คำแปลออนไลน์
  const [translating, setTranslating] = useState(false);
  const [itemMsg, setItemMsg] = useState('');

  const preview = useBlobUrl(file ?? undefined);

  useEffect(() => {
    setDay(todayDay(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tripStart, settings.days]);

  const jpy = parseFloat(amount.replace(/,/g, '')) || 0;

  async function onPick(f?: File | null) {
    if (!f) return;
    setFile(f);
    setRaw('');
    setCandidates([]);
    setAmount('');
    setTitle('');
    setError('');
    setSavedMsg('');
    setItems([]);
    setOnline({});
    setItemMsg('');
    setBusy(true);
    setProgress({ status: 'กำลังเตรียมรูป…', pct: 0 });
    try {
      const prepared = await prepareForOcr(f);
      const text = await recognize(prepared, 'receipt', C.ocrLang, (m) =>
        setProgress({ status: statusTh(m.status), pct: Math.round((m.progress || 0) * 100) }),
      );
      setRaw(text);
      const g = guessReceipt(text, C.code);
      setCandidates(g.candidates);
      const its = parseItems(text, C.code);
      setItems(its);
      const cat = guessCategory(its.map((i) => i.name), C.code);
      if (cat) setCategory(cat);
      if (g.total != null) setAmount(String(g.total));
      else setError('อ่านยอดรวมไม่เจอ — พิมพ์ยอดเองได้เลย (ลองถ่ายใหม่ให้ใบเสร็จเต็มเฟรม แสงสว่าง ไม่เอียง)');
    } catch (e) {
      setError(
        `อ่านข้อความไม่สำเร็จ: ถ้าเปิดแอปครั้งแรกต้องต่ออินเทอร์เน็ตเพื่อโหลดข้อมูลภาษา${C.langName}ก่อน 1 ครั้ง แล้วหลังจากนั้นใช้ออฟไลน์ได้ — ตอนนี้พิมพ์ยอดเองได้เลย`,
      );
      console.warn(e);
    }
    setBusy(false);
  }

  async function save() {
    if (!(jpy > 0)) return setError(`ใส่ยอดเงินเป็น${C.curName}ก่อน`);
    const receipt = file ? await shrinkImage(file, 1400, 0.75) : undefined;
    await db.daily.add({
      uid: newUid(),
      tripUid: settings.uid,
      payer: settings.splitMode === 'split' ? settings.me : undefined, // โหมดหาร: คนสแกนเป็นคนจ่าย แก้ได้ในหน้าค่าใช้จ่าย
      day,
      category,
      title: title.trim() || 'ใบเสร็จที่สแกน',
      jpy,
      note: itemsNote(),
      receipt,
      createdAt: Date.now(),
    });
    setSavedMsg(`บันทึกแล้ว ${fmtCur(jpy)} ลงวันที่ ${day}`);
    setFile(null);
    setRaw('');
    setCandidates([]);
    setAmount('');
    setTitle('');
    setError('');
    setItems([]);
    setOnline({});
    setItemMsg('');
  }

  const thOf = (name: string) => glossItem(name, C.code)?.th ?? online[name] ?? '';
  const unknown = items.filter((i) => !glossItem(i.name, C.code) && !online[i.name]);

  /** เก็บรายการสินค้า + คำแปลไว้ในโน้ตของรายจ่าย จะได้ย้อนดูได้ว่าซื้ออะไร */
  function itemsNote(): string {
    return items
      .map((i) => `${i.name}${thOf(i.name) ? ` (${thOf(i.name)})` : ''}${i.qty > 1 ? ` ×${i.qty}` : ''} ${fmtCur(i.price)}`)
      .join(', ')
      .slice(0, 800);
  }

  async function translateUnknown() {
    setTranslating(true);
    setItemMsg('');
    const next = { ...online };
    for (const i of unknown) {
      try {
        next[i.name] = await myMemory(i.name, C.mtLang, 'th');
        setOnline({ ...next });
      } catch {
        setItemMsg('แปลออนไลน์ไม่ได้ (ไม่มีเน็ต หรือโควตาฟรีวันนี้เต็ม) — ดูคำแปลจากพจนานุกรมในเครื่องไปก่อน');
        break;
      }
    }
    setTranslating(false);
  }

  return (
    <>
      <PageHeader title="สแกนใบเสร็จ" subtitle={`อ่านใบเสร็จ${C.langName}ในเครื่อง ไม่ส่งรูปไปไหน`} />
      <section className="space-y-3 p-4">
        {savedMsg && (
          <div className="rounded-2xl bg-ios-green/10 p-3 text-sm text-ios-green">
            ✅ {savedMsg} · <Link href="/expenses/" className="font-bold underline">ดูรายการ</Link>
          </div>
        )}

        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="btn-primary cursor-pointer !py-3">
              📷 ถ่ายใบเสร็จ
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
            <label className="btn-ghost cursor-pointer !py-3">
              🖼️ เลือกรูป
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-xs text-ios-secondary">
            เคล็ดลับ: วางใบเสร็จบนพื้นเรียบ ถ่ายตรง ๆ ให้เต็มเฟรม แสงพอ ไม่เงาสะท้อน — OCR ภาษาญี่ปุ่นอ่านผิดได้ จึงควรเช็กยอดก่อนบันทึกทุกครั้ง
          </p>
        </div>

        {preview && (
          <div className="card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="ใบเสร็จ" className="max-h-72 w-full rounded-xl object-contain" />
            {busy && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-ios-secondary">
                  <span>{progress.status}</span>
                  <span>{progress.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ios-fill">
                  <div className="h-full bg-ios-blue transition-all" style={{ width: `${progress.pct}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {file && !busy && (
          <div className="card space-y-3">
            <h3 className="text-sm font-bold">ตรวจและบันทึกยอด</h3>
            {error && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{error}</p>}

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="label">ยอดรวม ({C.curName})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ios-secondary">{C.sym}</span>
                  <input className="input !pl-8 !text-xl !font-bold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="pb-2 text-right">
                <div className="text-[11px] text-ios-secondary">≈ บาท (เรท {stats.rate.toFixed(4)})</div>
                <div className="text-lg font-bold text-ios-red">{stats.rate > 0 ? fmtThb(jpy * stats.rate) : '—'}</div>
              </div>
            </div>

            {candidates.length > 1 && (
              <div>
                <div className="label">ตัวเลขที่อ่านเจอ — แตะเพื่อเลือกยอดที่ถูก</div>
                <div className="hscroll">
                  {candidates.map((c) => (
                    <button key={c} className={jpy === c ? 'chip-on' : 'chip'} onClick={() => setAmount(String(c))}>
                      {fmtCur(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div>
                <div className="label">🛒 รายการในใบเสร็จ (แปลเป็นไทย)</div>
                <div className="ios-list">
                  {items.map((i, idx) => {
                    const th = thOf(i.name);
                    return (
                      <div key={idx} className="ios-row">
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium leading-snug ${th ? '' : 'text-ios-secondary'}`}>{th || 'ยังไม่รู้ว่าคืออะไร'}</div>
                          <div className="truncate text-xs text-ios-secondary">
                            {i.name}
                            {online[i.name] && !glossItem(i.name, C.code) ? ' · แปลออนไลน์' : ''}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-semibold tabular-nums">{fmtCur(i.price)}</div>
                          {i.qty > 1 && <div className="text-xs text-ios-secondary">×{i.qty}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {unknown.length > 0 && (
                  <button className="btn-ghost mt-2 w-full" onClick={translateUnknown} disabled={translating}>
                    {translating ? 'กำลังแปล…' : `🌐 แปลรายการที่ยังไม่รู้จัก ${unknown.length} รายการ (ต้องมีเน็ต)`}
                  </button>
                )}
                {itemMsg && <p className="mt-2 text-xs text-ios-orange">{itemMsg}</p>}
                <p className="mt-1 text-[11px] text-ios-secondary">คำแปลจากพจนานุกรมในเครื่องเป็นคำที่พบบ่อย ชื่อสินค้าที่ OCR อ่านเพี้ยนอาจแปลไม่ได้ · รายการจะถูกบันทึกไว้ในโน้ตของรายจ่ายด้วย</p>
              </div>
            )}

            <div className="hscroll">
              {DAY_CATS.map((c) => (
                <button key={c.key} className={category === c.key ? 'chip-on' : 'chip'} onClick={() => setCategory(c.key)}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">ลงวันที่</label>
                <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                  {Array.from({ length: settings.days }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{dayLabel(settings, d)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">ชื่อร้าน/รายการ</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ดอนกิ" />
              </div>
            </div>

            <button className="btn-primary w-full !py-3 text-base" onClick={save}>
              💾 บันทึกเป็นรายจ่าย (พร้อมแนบรูป)
            </button>

            {raw && (
              <details className="text-xs text-ios-secondary">
                <summary className="cursor-pointer">ดูข้อความที่อ่านได้ทั้งหมด</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-ios-fill p-2">{raw}</pre>
              </details>
            )}
          </div>
        )}
      </section>
    </>
  );
}
