// สรุปรายคน + เคลียร์เงินในทริปที่ไปหลายคน (คิดเป็นบาททั้งหมด: ล่วงหน้าเป็นบาทอยู่แล้ว รายวันคูณเรทของทริป)
// โหมด shared (กระเป๋าร่วม): แสดงแค่ว่าใครจ่าย/ใช้ไปเท่าไร ไม่คิดเงินคืน
// โหมด split (หารกัน): แต่ละรายการ คนจ่ายออกเงินไป แล้วหารเท่า ๆ กันให้คนที่ "หารกับ" → คิดว่าใครต้องโอนให้ใคร
import type { DailyExpense, Member, PreExpense, Settings } from './db';

export const COMMON = 'both'; // จ่ายจากกองกลาง/ร่วมกัน

export interface PersonStat {
  id: string;
  name: string;
  paidThb: number; // ควักจ่ายไป
  shareThb: number; // ส่วนที่ตัวเองต้องรับผิดชอบ (ส่วนแบ่งจากการหาร)
  balance: number; // + = ควรได้คืน, − = ต้องโอนให้คนอื่น
}

export interface Transfer {
  from: Member;
  to: Member;
  thb: number;
}

export interface PeopleSummary {
  people: PersonStat[];
  transfers: Transfer[];
  commonThb: number; // รายการที่จ่ายจากกองกลาง
  unassigned: { count: number; thb: number }; // ยังไม่ระบุคนจ่าย (โหมดหารจะไม่นำไปคิด)
}

/** ผู้ที่หารรายการนี้ (ไม่ได้ระบุ / ระบุแต่คนนั้นถูกลบไปแล้ว → ทุกคน) */
export function sharersOf(split: string[] | undefined, members: Member[]): Member[] {
  const picked = (split ?? []).map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
  return picked.length ? picked : members;
}

export function computePeople(s: Settings, pre: PreExpense[], daily: DailyExpense[], rate: number): PeopleSummary {
  const members = s.members;
  const map = new Map<string, PersonStat>(members.map((m) => [m.id, { id: m.id, name: m.name, paidThb: 0, shareThb: 0, balance: 0 }]));
  let commonThb = 0;
  const unassigned = { count: 0, thb: 0 };

  const rows = [
    ...pre.map((p) => ({ thb: p.thb, payer: p.payer, split: p.split })),
    ...daily.map((d) => ({ thb: d.jpy * rate, payer: d.payer, split: d.split })),
  ];
  for (const r of rows) {
    if (!(r.thb > 0)) continue;
    if (r.payer === COMMON) {
      commonThb += r.thb; // กองกลางทุกคนลงเท่ากัน → ไม่กระทบยอดเคลียร์
      continue;
    }
    const payer = r.payer ? map.get(r.payer) : undefined;
    if (!payer) {
      unassigned.count++;
      unassigned.thb += r.thb;
      continue;
    }
    payer.paidThb += r.thb;
    const sharers = sharersOf(r.split, members);
    for (const m of sharers) map.get(m.id)!.shareThb += r.thb / sharers.length;
  }

  const people = [...map.values()].map((p) => ({ ...p, balance: p.paidThb - p.shareThb }));
  return { people, transfers: s.splitMode === 'split' ? settle(people, members) : [], commonThb, unassigned };
}

/** จับคู่คนที่ติดเงินกับคนที่ควรได้คืน ให้โอนกันน้อยครั้งที่สุดโดยประมาณ (ปัดเป็นบาท ไม่นับต่ำกว่า 1 บาท) */
function settle(people: PersonStat[], members: Member[]): Transfer[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const cred = people.filter((p) => p.balance > 0.5).map((p) => ({ id: p.id, left: p.balance })).sort((a, b) => b.left - a.left);
  const debt = people.filter((p) => p.balance < -0.5).map((p) => ({ id: p.id, left: -p.balance })).sort((a, b) => b.left - a.left);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].left, cred[j].left);
    if (Math.round(amt) >= 1) out.push({ from: byId.get(debt[i].id)!, to: byId.get(cred[j].id)!, thb: Math.round(amt) });
    debt[i].left -= amt;
    cred[j].left -= amt;
    if (debt[i].left < 0.5) i++;
    if (cred[j].left < 0.5) j++;
  }
  return out;
}

/** ชื่อที่แสดงของผู้จ่าย */
export function payerName(payer: string | undefined, members: Member[], mode: Settings['splitMode']): string {
  if (!payer) return '';
  if (payer === COMMON) return mode === 'split' ? 'กองกลาง' : 'ร่วมกัน';
  return members.find((m) => m.id === payer)?.name ?? '';
}
