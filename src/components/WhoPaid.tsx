'use client';
// เลือก "ใครจ่าย" และ (โหมดหาร) "หารกับใคร" — ใช้ทั้งฟอร์มค่าใช้จ่ายล่วงหน้าและรายวัน
import type { Member, SplitMode } from '@/lib/db';
import { COMMON } from '@/lib/people';

interface Props {
  members: Member[];
  mode: SplitMode;
  payer: string | undefined;
  onPayer: (p: string | undefined) => void;
  split: string[] | undefined; // undefined = ทุกคน
  onSplit: (s: string[] | undefined) => void;
}

export default function WhoPaid({ members, mode, payer, onPayer, split, onSplit }: Props) {
  const everyone = !split || split.length === 0 || split.length === members.length;
  const inSplit = (id: string) => everyone || split!.includes(id);

  function toggleSharer(id: string) {
    const cur = everyone ? members.map((m) => m.id) : [...split!];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (next.length === 0) return; // ต้องมีอย่างน้อย 1 คน
    onSplit(next.length === members.length ? undefined : next);
  }

  if (mode === 'shared') {
    return (
      <div>
        <label className="label">ใครจ่าย / ใครใช้ (ไม่บังคับ — กระเป๋าเงินร่วม ไม่มีการคืนเงิน)</label>
        <div className="hscroll">
          {members.map((m) => (
            <button key={m.id} className={payer === m.id ? 'chip-on' : 'chip'} onClick={() => onPayer(payer === m.id ? undefined : m.id)}>
              {m.name}
            </button>
          ))}
          {members.length > 1 && (
            <button className={payer === COMMON ? 'chip-on' : 'chip'} onClick={() => onPayer(payer === COMMON ? undefined : COMMON)}>
              ร่วมกัน
            </button>
          )}
        </div>
      </div>
    );
  }

  const sharers = members.filter((m) => inSplit(m.id));
  return (
    <div className="space-y-2">
      <div>
        <label className="label">ใครจ่าย</label>
        <div className="hscroll">
          {members.map((m) => (
            <button key={m.id} className={payer === m.id ? 'chip-on' : 'chip'} onClick={() => onPayer(m.id)}>
              {m.name}
            </button>
          ))}
          <button className={payer === COMMON ? 'chip-on' : 'chip'} onClick={() => onPayer(COMMON)}>
            กองกลาง
          </button>
        </div>
        {!payer && <p className="mt-1 px-1 text-[12px] text-ios-orange">ยังไม่ได้เลือกคนจ่าย — รายการนี้จะไม่ถูกนำไปคิดเคลียร์เงิน</p>}
      </div>
      {payer !== COMMON && (
        <div>
          <label className="label">
            หารกับ {everyone ? '(ทุกคน)' : `(${sharers.length} คน)`} — แตะชื่อเพื่อเอาออก/ใส่กลับ
          </label>
          <div className="hscroll">
            <button className={everyone ? 'chip-on' : 'chip'} onClick={() => onSplit(undefined)}>
              ทุกคน
            </button>
            {members.map((m) => (
              <button key={m.id} className={inSplit(m.id) ? 'chip-on' : 'chip'} onClick={() => toggleSharer(m.id)}>
                {inSplit(m.id) ? '✓ ' : ''}
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
