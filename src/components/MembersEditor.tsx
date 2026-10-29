'use client';
// จัดการสมาชิกของทริปที่เปิดอยู่: เพิ่ม/แก้ชื่อ/ลบ · เลือกว่าเครื่องนี้คือใคร · โหมดกระเป๋าร่วม/หารกัน
import { useEffect, useState } from 'react';
import { db, newMemberId, saveSettings, type Member, type Settings } from '@/lib/db';

function NameInput({ m, onCommit }: { m: Member; onCommit: (name: string) => void }) {
  const [v, setV] = useState(m.name);
  useEffect(() => setV(m.name), [m.name]);
  return (
    <input
      className="min-w-0 flex-1 bg-transparent text-[17px] outline-none"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v.trim() !== m.name && onCommit(v.trim())}
      aria-label="ชื่อสมาชิก"
    />
  );
}

export default function MembersEditor({ s }: { s: Settings }) {
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');

  const save = (members: Member[]) => saveSettings({ members });

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await save([...s.members, { id: newMemberId(), name }]);
    setNewName('');
  }

  async function remove(m: Member) {
    // ลบได้เฉพาะคนที่ยังไม่มีรายการผูกอยู่ ไม่งั้นยอดเคลียร์เงินจะผิด
    const used =
      (await db.daily.where('tripUid').equals(s.uid).filter((d) => d.payer === m.id || !!d.split?.includes(m.id)).count()) +
      (await db.pre.where('tripUid').equals(s.uid).filter((d) => d.payer === m.id || !!d.split?.includes(m.id)).count());
    if (used > 0) return setMsg(`ลบ ${m.name} ไม่ได้ — มี ${used} รายการที่ระบุชื่อนี้อยู่ (แก้รายการเหล่านั้นก่อน หรือเปลี่ยนชื่อแทน)`);
    if (s.members.length <= 1) return setMsg('ทริปต้องมีสมาชิกอย่างน้อย 1 คน');
    if (!confirm(`ลบ ${m.name} ออกจากทริปนี้?`)) return;
    setMsg('');
    await save(s.members.filter((x) => x.id !== m.id));
  }

  return (
    <div className="space-y-3">
      <div className="segmented grid-cols-2">
        <button className={s.splitMode === 'shared' ? 'seg-on' : 'seg'} onClick={() => saveSettings({ splitMode: 'shared' })}>
          กระเป๋าเงินร่วม
        </button>
        <button className={s.splitMode === 'split' ? 'seg-on' : 'seg'} onClick={() => saveSettings({ splitMode: 'split' })}>
          หารกัน (คิดเงินคืน)
        </button>
      </div>
      <p className="px-1 text-[12px] text-ios-secondary">
        {s.splitMode === 'shared'
          ? 'ใช้เงินกองเดียวกัน ไม่ต้องคืนเงินกัน — แท็กชื่อไว้ดูสถิติว่าใครจ่าย/ใช้เท่าไร'
          : 'ใครจ่ายรายการไหนก็เลือกชื่อ แล้วเลือกว่าหารกับใคร — แอปสรุปให้ว่าใครต้องโอนให้ใครเท่าไร (หน้าค่าใช้จ่าย)'}
      </p>

      <div className="ios-list !bg-ios-fill">
        {s.members.map((m) => (
          <div key={m.id} className="ios-row !py-2.5">
            <button
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${s.me === m.id ? 'bg-ios-blue text-white' : 'bg-ios-card text-ios-secondary ring-1 ring-ios-separator'}`}
              onClick={() => saveSettings({ me: m.id })}
              aria-label={`ฉันคือ ${m.name}`}
            >
              {s.me === m.id ? '✓' : ''}
            </button>
            <NameInput m={m} onCommit={(name) => save(s.members.map((x) => (x.id === m.id ? { ...x, name } : x)))} />
            {s.me === m.id && <span className="shrink-0 rounded-full bg-ios-blue/10 px-2 py-0.5 text-[11px] font-semibold text-ios-blue">ฉัน</span>}
            <button className="shrink-0 px-1 text-[15px] text-ios-red" onClick={() => remove(m)} aria-label={`ลบ ${m.name}`}>
              ลบ
            </button>
          </div>
        ))}
      </div>
      <p className="px-1 text-[12px] text-ios-secondary">แตะวงกลมหน้าชื่อเพื่อบอกว่า “เครื่องนี้คือฉัน” (ใช้เป็นคนจ่ายเริ่มต้น) · แตะชื่อเพื่อแก้</p>

      <div className="flex gap-2">
        <input className="input" placeholder="ชื่อเพื่อนร่วมทริป" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-primary shrink-0" onClick={add} disabled={!newName.trim()}>
          ＋ เพิ่ม
        </button>
      </div>
      {msg && <p className="text-[13px] text-ios-orange">{msg}</p>}
    </div>
  );
}
