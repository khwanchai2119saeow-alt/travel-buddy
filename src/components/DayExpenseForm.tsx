'use client';
// ฟอร์มจดค่าใช้จ่ายรายวัน (เงินท้องถิ่น) — เน้นกรอกเร็ว: ใส่ยอด → เลือกหมวด → บันทึก
import { useEffect, useState } from 'react';
import { db, newUid, type DailyExpense, type DayCategory, type Member, type Payer, type Place, type SplitMode } from '@/lib/db';
import { DAY_CATS } from '@/lib/constants';
import { activeCountry, fmtThb } from '@/lib/format';
import { shrinkImage } from '@/lib/image';
import { useBlobUrl } from './ui';
import WhoPaid from './WhoPaid';

interface Props {
  tripUid: string;
  day: number;
  rate: number;
  members: Member[];
  mode: SplitMode;
  me: string; // เครื่องนี้คือใคร (ค่าเริ่มต้นของ "ใครจ่าย" ในโหมดหาร)
  places: Place[]; // สถานที่ของวันนั้น (ไว้ผูกกับรายจ่าย)
  editing: DailyExpense | null;
  onDone: () => void;
}

export default function DayExpenseForm({ tripUid, day, rate, members, mode, me, places, editing, onDone }: Props) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<DayCategory>('food');
  const [title, setTitle] = useState('');
  const [payer, setPayer] = useState<Payer | undefined>(undefined);
  const [split, setSplit] = useState<string[] | undefined>(undefined);
  const [placeUid, setPlaceUid] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<Blob | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const C = activeCountry();

  useEffect(() => {
    setAmount(editing ? String(editing.jpy) : '');
    setCategory(editing?.category ?? 'food');
    setTitle(editing?.title ?? '');
    setPayer(editing ? editing.payer : mode === 'split' ? me : undefined);
    setSplit(editing?.split);
    setPlaceUid(editing?.placeUid ?? '');
    setNote(editing?.note ?? '');
    setReceipt(undefined);
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, mode, me]);

  const jpy = parseFloat(amount.replace(/,/g, '')) || 0;
  const previewBlob = receipt === undefined ? editing?.receipt : receipt ?? undefined;
  const previewUrl = useBlobUrl(previewBlob);

  async function attach(file?: File | null) {
    if (!file) return;
    try {
      setReceipt(await shrinkImage(file, 1400, 0.75));
    } catch {
      setMsg('ใช้รูปนี้ไม่ได้');
    }
  }

  async function save() {
    if (!(jpy > 0)) return setMsg(`ใส่ยอดเงินเป็น${C.curName}ก่อน`);
    const data = {
      day,
      category,
      title: title.trim(),
      jpy,
      payer,
      split,
      placeUid: placeUid || undefined,
      note: note.trim(),
    };
    if (editing?.id) {
      const changes: Partial<DailyExpense> = { ...data };
      if (receipt !== undefined) changes.receipt = receipt ?? undefined;
      await db.daily.update(editing.id, changes);
    } else {
      await db.daily.add({ ...data, uid: newUid(), tripUid, createdAt: Date.now(), receipt: receipt ?? undefined });
    }
    setAmount('');
    setTitle('');
    setNote('');
    setReceipt(undefined);
    setPlaceUid('');
    setSplit(undefined);
    setMsg('');
    onDone();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{editing ? '✏️ แก้ไขรายการ' : '＋ จดรายจ่ายวันนี้'}</h3>
        {editing && (
          <button className="text-xs font-semibold text-ios-secondary underline" onClick={onDone}>
            ยกเลิกการแก้ไข
          </button>
        )}
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label">ยอดเงิน ({C.curName})</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ios-secondary">{C.sym}</span>
            <input
              className="input !pl-8 !text-xl !font-bold"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="pb-2 text-right">
          <div className="text-[11px] text-ios-secondary">เทียบเป็นบาท</div>
          <div className="text-lg font-bold text-ios-red">{rate > 0 ? fmtThb(jpy * rate) : '—'}</div>
        </div>
      </div>

      <div className="hscroll">
        {DAY_CATS.map((c) => (
          <button key={c.key} className={category === c.key ? 'chip-on' : 'chip'} onClick={() => setCategory(c.key)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <input className="input" placeholder="รายละเอียด (ไม่บังคับ) เช่น ราเม็งหน้าสถานี" value={title} onChange={(e) => setTitle(e.target.value)} />

      <WhoPaid members={members} mode={mode} payer={payer} onPayer={setPayer} split={split} onSplit={setSplit} />

      {places.length > 0 && (
        <div>
          <label className="label">ผูกกับสถานที่ในแผน (ไม่บังคับ)</label>
          <select className="input" value={placeUid} onChange={(e) => setPlaceUid(e.target.value)}>
            <option value="">— ไม่ผูก —</option>
            {places.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.kind === 'hotel' ? '🏨 ' : '📍 '}
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <input className="input" placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />

      <div className="flex items-center gap-2">
        <label className="btn-ghost cursor-pointer">
          🧾 แนบรูปใบเสร็จ
          <input type="file" accept="image/*" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
        </label>
        {previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="ใบเสร็จ" className="h-12 w-12 rounded-lg object-cover ring-1 ring-ios-separator" />
            <button className="text-xs text-ios-secondary underline" onClick={() => setReceipt(null)}>
              เอาออก
            </button>
          </>
        )}
      </div>

      {msg && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{msg}</p>}
      <button className="btn-primary w-full !py-3 text-base" onClick={save}>
        💾 {editing ? 'บันทึกการแก้ไข' : 'บันทึกรายจ่าย'}
      </button>
    </div>
  );
}
