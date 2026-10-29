'use client';
// สรุปรายคน: กระเป๋าร่วม = ใครจ่าย/ใช้ไปเท่าไร · หารกัน = ใครควักไป ส่วนของใคร และใครต้องโอนให้ใคร
import type { Settings } from '@/lib/db';
import type { PeopleSummary } from '@/lib/people';
import { fmtThb0 } from '@/lib/format';

export default function PeopleCard({ settings, summary }: { settings: Settings; summary: PeopleSummary }) {
  const { people, transfers, commonThb, unassigned } = summary;
  const split = settings.splitMode === 'split';
  if (people.length < 2 && !split) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">👥 สรุปรายคน</h3>
        <span className="text-[12px] text-ios-secondary">{split ? 'โหมดหารกัน' : 'กระเป๋าเงินร่วม'} · คิดเป็นบาท</span>
      </div>

      <div className="ios-list !bg-ios-fill">
        {people.map((p) => (
          <div key={p.id} className="ios-row !py-2.5 text-[15px]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ios-blue text-[13px] font-bold text-white">{initial(p.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {p.name}
                {p.id === settings.me ? ' (ฉัน)' : ''}
              </span>
              <span className="block text-[12px] text-ios-secondary">
                จ่ายไป {fmtThb0(p.paidThb)}
                {split ? ` · ส่วนของตัวเอง ${fmtThb0(p.shareThb)}` : ''}
              </span>
            </span>
            {split && (
              <span className={`shrink-0 text-right text-[15px] font-semibold tabular-nums ${p.balance > 0.5 ? 'text-ios-green' : p.balance < -0.5 ? 'text-ios-red' : 'text-ios-secondary'}`}>
                {p.balance > 0.5 ? `ได้คืน ${fmtThb0(p.balance)}` : p.balance < -0.5 ? `ต้องจ่าย ${fmtThb0(-p.balance)}` : 'พอดี'}
              </span>
            )}
          </div>
        ))}
      </div>

      {split && (
        <div>
          <div className="mb-1 text-[13px] font-semibold">💸 เคลียร์เงิน</div>
          {transfers.length === 0 ? (
            <p className="text-[13px] text-ios-secondary">ยังไม่มีใครต้องโอนให้ใคร</p>
          ) : (
            <ul className="space-y-1">
              {transfers.map((t, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl bg-ios-green/10 px-3 py-2 text-[15px]">
                  <span>
                    <b>{t.from.name}</b> → โอนให้ <b>{t.to.name}</b>
                  </span>
                  <span className="font-bold tabular-nums">{fmtThb0(t.thb)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(commonThb > 0 || unassigned.count > 0) && (
        <p className="text-[12px] text-ios-secondary">
          {commonThb > 0 ? `${split ? 'จ่ายจากกองกลาง' : 'จ่ายร่วมกัน'} ${fmtThb0(commonThb)}` : ''}
          {commonThb > 0 && unassigned.count > 0 ? ' · ' : ''}
          {unassigned.count > 0 ? `ยังไม่ระบุคนจ่าย ${unassigned.count} รายการ (${fmtThb0(unassigned.thb)})${split ? ' — ไม่ถูกนำไปคิดเคลียร์เงิน' : ''}` : ''}
        </p>
      )}
    </div>
  );
}

/** ตัวอักษรย่อของชื่อ — ข้ามสระหน้าภาษาไทย (เ แ โ ใ ไ) เพื่อให้ได้พยัญชนะตัวแรก เช่น โอ๊ต → อ */
function initial(name: string): string {
  const s = name.trim().replace(/^[เแโใไ]/, '');
  return Array.from(s)[0]?.toUpperCase() ?? '?';
}
