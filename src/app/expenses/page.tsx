'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db, newUid, type DailyExpense, type PreCategory, type PreExpense, type Settings } from '@/lib/db';
import { DAY_CATS, PRE_CATS, dayCat, preCat } from '@/lib/constants';
import { computePeople, payerName, sharersOf } from '@/lib/people';
import PeopleCard from '@/components/PeopleCard';
import WhoPaid from '@/components/WhoPaid';
import { useStats, useTripPlaces } from '@/lib/stats';
import { countryOf } from '@/lib/country';
import { dayLabel, fmtCur, fmtThb, fmtThb0, todayDay } from '@/lib/format';
import { BlobImg, EmptyState, Modal, PageHeader, Stat } from '@/components/ui';
import DailyChart from '@/components/DailyChart';
import DayExpenseForm from '@/components/DayExpenseForm';

export default function ExpensesPage() {
  const { stats, settings, pre, daily } = useStats();
  const places = useTripPlaces(settings.uid) ?? [];
  const C = countryOf(settings.country);

  const [tab, setTab] = useState<'pre' | 'trip'>('trip');
  const [day, setDay] = useState<number>(1);
  const [unit, setUnit] = useState<'jpy' | 'thb'>('jpy');
  const [editingDaily, setEditingDaily] = useState<DailyExpense | null>(null);
  const [editingPre, setEditingPre] = useState<PreExpense | null>(null);
  const [receiptOf, setReceiptOf] = useState<DailyExpense | null>(null);

  useEffect(() => {
    setDay(todayDay(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tripStart, settings.days]);

  const dayItems = useMemo(
    () => daily.filter((e) => e.day === day).sort((a, b) => b.createdAt - a.createdAt),
    [daily, day],
  );
  const dayPlaces = useMemo(
    () => places.filter((p) => p.day === day).sort((a, b) => a.order - b.order),
    [places, day],
  );
  const placeName = (uid?: string) => (uid ? places.find((p) => p.uid === uid)?.title : undefined);
  const dayStat = stats.perDay[day - 1];
  const days = Array.from({ length: settings.days }, (_, i) => i + 1);

  async function removeDaily(e: DailyExpense) {
    if (e.id && confirm('ลบรายการนี้?')) await db.daily.delete(e.id);
  }

  return (
    <>
      <PageHeader title="ค่าใช้จ่าย" subtitle={`${C.flag} ${settings.name} · ${fmtCur(C.rateUnit)} = ฿${(stats.rate * C.rateUnit).toFixed(2)}`} />

      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <button className={`rounded-2xl p-3 text-left ring-1 ${tab === 'pre' ? 'bg-ios-blue text-white ring-ios-blue' : 'bg-ios-card ring-ios-separator'}`} onClick={() => setTab('pre')}>
          <div className="text-xs opacity-80">ส่วนที่ 1 · จ่ายล่วงหน้า (ไทย)</div>
          <div className="text-lg font-bold">{fmtThb0(stats.preTotalThb)}</div>
        </button>
        <button className={`rounded-2xl p-3 text-left ring-1 ${tab === 'trip' ? 'bg-ios-blue text-white ring-ios-blue' : 'bg-ios-card ring-ios-separator'}`} onClick={() => setTab('trip')}>
          <div className="text-xs opacity-80">ส่วนที่ 2 · ใช้ที่{C.name}</div>
          <div className="text-lg font-bold">{fmtCur(stats.tripTotalJpy)}</div>
          <div className="text-[11px] opacity-80">≈ {fmtThb0(stats.tripTotalThb)}</div>
        </button>
      </div>

      {tab === 'pre' ? (
        <PreSection
          pre={pre}
          tripUid={settings.uid}
          settings={settings}
          editing={editingPre}
          setEditing={setEditingPre}
          total={stats.preTotalThb}
        />
      ) : (
        <section className="space-y-3 p-4">
          {stats.rate <= 0 && (
            <div className="rounded-2xl bg-ios-orange/10 p-3 text-sm text-ios-orange">
              ยังไม่ได้ตั้งเรทแลกเงิน — ไปที่ <Link href="/settings/" className="font-bold underline">ตั้งค่า</Link> เพื่อใส่เรทก่อน ยอดบาทจะได้ถูกต้อง
            </div>
          )}

          <div className="hscroll">
            {days.map((d) => (
              <button
                key={d}
                className={day === d ? 'chip-on' : 'chip'}
                onClick={() => {
                  setDay(d);
                  setEditingDaily(null);
                }}
              >
                {dayLabel(settings, d)}
                {stats.perDay[d - 1]?.jpy > 0 && <span className="ml-1 opacity-70">•</span>}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label={`รวม ${dayLabel(settings, day)}`} value={fmtCur(dayStat?.jpy ?? 0)} sub={`≈ ${fmtThb(((dayStat?.jpy ?? 0) * stats.rate))}`} tone="rose" />
            <Stat
              label={`เงิน${C.curName}ที่เหลือ (จากที่แลกไว้)`}
              value={stats.exchangedJpy > 0 ? fmtCur(stats.walletLeftJpy) : '—'}
              sub={stats.exchangedJpy > 0 ? `แลกไว้ทั้งหมด ${fmtCur(stats.exchangedJpy)}` : 'เพิ่มล็อตแลกเงินในตั้งค่า'}
              tone={stats.walletLeftJpy < 0 ? 'rose' : 'emerald'}
            />
          </div>

          <DayExpenseForm
            tripUid={settings.uid}
            day={day}
            rate={stats.rate}
            members={settings.members}
            mode={settings.splitMode}
            me={settings.me}
            places={dayPlaces}
            editing={editingDaily}
            onDone={() => setEditingDaily(null)}
          />

          <div className="card !p-0">
            <h3 className="px-4 pt-3 text-sm font-bold">รายการของ {dayLabel(settings, day)}</h3>
            {dayItems.length === 0 ? (
              <EmptyState text="ยังไม่มีรายการวันนี้" />
            ) : (
              <ul className="divide-y divide-ios-separator">
                {dayItems.map((e) => {
                  const c = dayCat(e.category);
                  const who = whoText(settings, e.payer, e.split);
                  const where = placeName(e.placeUid);
                  return (
                    <li key={e.uid} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg" style={{ background: c.color + '22' }}>
                        {c.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{e.title || c.label}</div>
                        <div className="truncate text-xs text-ios-secondary">
                          {c.label}
                          {who ? ` · ${who}` : ''}
                          {where ? ` · 📍${where}` : ''}
                          {e.note ? ` · ${e.note}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{fmtCur(e.jpy)}</div>
                        <div className="text-[11px] text-ios-secondary">{fmtThb(e.jpy * stats.rate)}</div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          {e.receipt && (
                            <button className="rounded-lg bg-ios-fill px-1.5 py-0.5 text-xs" onClick={() => setReceiptOf(e)} aria-label="ดูใบเสร็จ">🧾</button>
                          )}
                          <button className="rounded-lg bg-ios-fill px-1.5 py-0.5 text-xs" onClick={() => setEditingDaily(e)} aria-label="แก้ไข">✏️</button>
                          <button className="rounded-lg bg-ios-red/10 px-1.5 py-0.5 text-xs" onClick={() => removeDaily(e)} aria-label="ลบ">🗑️</button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">📊 ใช้จ่ายรายวัน (ดูเฉย ๆ ไม่มีวงเงินบังคับ)</h3>
              <div className="flex gap-1">
                <button className={unit === 'jpy' ? 'chip-on' : 'chip'} onClick={() => setUnit('jpy')}>{C.sym}</button>
                <button className={unit === 'thb' ? 'chip-on' : 'chip'} onClick={() => setUnit('thb')}>฿</button>
              </div>
            </div>
            <DailyChart perDay={stats.perDay} unit={unit} rate={stats.rate} />
          </div>

          <PeopleCard settings={settings} summary={computePeople(settings, pre, daily, stats.rate)} />

          <div className="card space-y-2">
            <h3 className="text-sm font-bold">แยกตามหมวด (ทั้งทริป)</h3>
            {DAY_CATS.map((c) => {
              const v = stats.byCat[c.key];
              const pct = stats.tripTotalJpy > 0 ? (v / stats.tripTotalJpy) * 100 : 0;
              return (
                <div key={c.key}>
                  <div className="flex justify-between text-xs">
                    <span>{c.emoji} {c.label}</span>
                    <span className="font-semibold">{fmtCur(v)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ios-fill">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </div>
              );
            })}
            {stats.activeDays > 0 && (
              <p className="text-xs text-ios-secondary">เฉลี่ยวันที่มีการใช้จ่าย {fmtCur(stats.avgPerActiveDayJpy)} (≈ {fmtThb0(stats.avgPerActiveDayJpy * stats.rate)}) ต่อวัน</p>
            )}
          </div>
        </section>
      )}

      <Modal open={!!receiptOf} onClose={() => setReceiptOf(null)} title="🧾 ใบเสร็จ">
        {receiptOf && (
          <>
            <BlobImg blob={receiptOf.receipt} alt="ใบเสร็จ" className="w-full rounded-2xl" />
            <p className="mt-2 text-sm text-ios-secondary">
              {receiptOf.title || dayCat(receiptOf.category).label} · {fmtCur(receiptOf.jpy)}
            </p>
            {receiptOf.note && (
              <div className="ios-list mt-3">
                {receiptOf.note.split(', ').map((line, i) => (
                  <div key={i} className="ios-row !py-2 text-[15px]">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------- ส่วนที่ 1: ค่าใช้จ่ายล่วงหน้า (บาท) ---------- */
function PreSection({
  tripUid,
  settings,
  pre,
  editing,
  setEditing,
  total,
}: {
  tripUid: string;
  settings: Settings;
  pre: PreExpense[];
  editing: PreExpense | null;
  setEditing: (p: PreExpense | null) => void;
  total: number;
}) {
  const [category, setCategory] = useState<PreCategory>('flight');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [payer, setPayer] = useState<string | undefined>(undefined);
  const [split, setSplit] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    setCategory(editing?.category ?? 'flight');
    setTitle(editing?.title ?? '');
    setAmount(editing ? String(editing.thb) : '');
    setNote(editing?.note ?? '');
    setPayer(editing ? editing.payer : settings.splitMode === 'split' ? settings.me : undefined);
    setSplit(editing?.split);
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, settings.splitMode, settings.me]);

  const sorted = useMemo(() => [...pre].sort((a, b) => b.createdAt - a.createdAt), [pre]);
  const subtotal = (k: PreCategory) => pre.filter((p) => p.category === k).reduce((a, p) => a + p.thb, 0);

  async function save() {
    const thb = parseFloat(amount.replace(/,/g, ''));
    if (!(thb > 0)) return setMsg('ใส่ยอดเงินเป็นบาทก่อน');
    const data = { category, title: title.trim(), thb, payer, split, note: note.trim() };
    if (editing?.id) await db.pre.update(editing.id, data);
    else await db.pre.add({ ...data, uid: newUid(), tripUid, createdAt: Date.now() });
    setEditing(null);
    setTitle('');
    setAmount('');
    setNote('');
    setMsg('');
  }

  async function remove(p: PreExpense) {
    if (p.id && confirm('ลบรายการนี้?')) await db.pre.delete(p.id);
  }

  return (
    <section className="space-y-3 p-4">
      <div className="card">
        <div className="text-xs font-semibold text-ios-secondary">รวมค่าใช้จ่ายล่วงหน้า (จ่ายเป็นบาทที่ไทยแล้ว)</div>
        <div className="text-3xl font-bold text-ios-red">{fmtThb(total)}</div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ios-secondary">
          {PRE_CATS.map((c) => {
            const v = subtotal(c.key);
            return v > 0 ? (
              <span key={c.key}>
                {c.emoji} {c.label} {fmtThb0(v)}
              </span>
            ) : null;
          })}
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-bold">{editing ? '✏️ แก้ไขรายการ' : '＋ เพิ่มรายการล่วงหน้า'}</h3>
        <div className="hscroll">
          {PRE_CATS.map((c) => (
            <button key={c.key} className={category === c.key ? 'chip-on' : 'chip'} onClick={() => setCategory(c.key)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <input className="input" placeholder="รายละเอียด เช่น ตั๋ว BKK–CTS ไป-กลับ 2 ที่นั่ง" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ios-secondary">฿</span>
          <input className="input !pl-8 !text-xl !font-bold" inputMode="decimal" placeholder="ยอดเงิน (บาท)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {settings.members.length > 1 && (
          <WhoPaid members={settings.members} mode={settings.splitMode} payer={payer} onPayer={setPayer} split={split} onSplit={setSplit} />
        )}
        <input className="input" placeholder="โน้ต (ไม่บังคับ) เช่น รหัสจอง, จ่ายด้วยบัตรไหน" value={note} onChange={(e) => setNote(e.target.value)} />
        {msg && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{msg}</p>}
        <div className="flex gap-2">
          {editing && (
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              ยกเลิก
            </button>
          )}
          <button className="btn-primary flex-1 !py-3 text-base" onClick={save}>
            💾 {editing ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="card !p-0">
        <h3 className="px-4 pt-3 text-sm font-bold">รายการทั้งหมด</h3>
        {sorted.length === 0 ? (
          <EmptyState text="ยังไม่มีรายการ เช่น ค่าตั๋วเครื่องบิน ค่าโรงแรม ประกัน อีซิม" />
        ) : (
          <ul className="divide-y divide-ios-separator">
            {sorted.map((p) => {
              const c = preCat(p.category);
              return (
                <li key={p.uid} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ios-fill text-lg">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.title || c.label}</div>
                    <div className="truncate text-xs text-ios-secondary">
                      {c.label}
                      {whoText(settings, p.payer, p.split) ? ` · ${whoText(settings, p.payer, p.split)}` : ''}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-bold">{fmtThb(p.thb)}</div>
                  <div className="flex gap-1">
                    <button className="rounded-lg bg-ios-fill px-1.5 py-0.5 text-xs" onClick={() => setEditing(p)} aria-label="แก้ไข">✏️</button>
                    <button className="rounded-lg bg-ios-red/10 px-1.5 py-0.5 text-xs" onClick={() => remove(p)} aria-label="ลบ">🗑️</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** ป้ายผู้จ่ายในรายการ เช่น "นิด จ่าย · หาร 3 คน" */
function whoText(s: Settings, payer: string | undefined, split: string[] | undefined): string {
  const name = payerName(payer, s.members, s.splitMode);
  if (!name) return '';
  if (s.splitMode !== 'split' || payer === 'both') return name;
  const n = sharersOf(split, s.members).length;
  return `${name} จ่าย · ${n === s.members.length ? 'หารทุกคน' : `หาร ${n} คน`}`;
}
