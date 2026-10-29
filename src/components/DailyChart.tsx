'use client';
import { DAY_CATS } from '@/lib/constants';
import type { DayStat } from '@/lib/stats';
import { activeCountry } from '@/lib/format';

interface Props {
  perDay: DayStat[];
  unit: 'jpy' | 'thb';
  rate: number;
}

function niceCeil(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function compact(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

/** กราฟแท่งซ้อนสีตามหมวด แสดงยอดใช้จ่ายรายวัน (เงินท้องถิ่น/บาท) พร้อมเส้นค่าเฉลี่ย — ไม่มีวงเงินบังคับ */
export default function DailyChart({ perDay, unit, rate }: Props) {
  const mult = unit === 'jpy' ? 1 : rate;
  const sym = unit === 'jpy' ? activeCountry().sym : '฿';
  const W = 360;
  const H = 200;
  const padL = 6;
  const padR = 6;
  const padT = 20;
  const padB = 24;
  const n = perDay.length;
  const totals = perDay.map((d) => d.jpy * mult);
  const max = Math.max(...totals, 1);
  const top = niceCeil(max * 1.05);
  const plotH = H - padT - padB;
  const bw = (W - padL - padR) / n;
  const active = totals.filter((t) => t > 0);
  const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  const yOf = (v: number) => padT + plotH - (v / top) * plotH;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="กราฟค่าใช้จ่ายรายวัน">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={yOf(top * f)} y2={yOf(top * f)} stroke="rgba(142,142,147,0.3)" strokeWidth="1" />
        ))}
        <line x1={padL} x2={W - padR} y1={yOf(0)} y2={yOf(0)} stroke="#8e8e93" strokeWidth="1" />

        {perDay.map((d, i) => {
          const x = padL + i * bw + bw * 0.14;
          const w = bw * 0.72;
          let acc = 0;
          return (
            <g key={d.day}>
              {DAY_CATS.map((c) => {
                const v = d.byCat[c.key] * mult;
                if (v <= 0) return null;
                const y1 = yOf(acc + v);
                const y0 = yOf(acc);
                acc += v;
                return <rect key={c.key} x={x} y={y1} width={w} height={Math.max(0.5, y0 - y1)} fill={c.color} rx="1.5" />;
              })}
              {totals[i] > 0 && (
                <text x={x + w / 2} y={yOf(totals[i]) - 3} fontSize="8" textAnchor="middle" fill="#8e8e93" fontWeight="600">
                  {compact(totals[i])}
                </text>
              )}
              <text x={x + w / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="#8e8e93">
                {d.day}
              </text>
            </g>
          );
        })}

        {avg > 0 && (
          <g>
            <line x1={padL} x2={W - padR} y1={yOf(avg)} y2={yOf(avg)} stroke="#ff3b30" strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={W - padR} y={yOf(avg) - 3} fontSize="8.5" textAnchor="end" fill="#ff3b30" fontWeight="700">
              เฉลี่ย {sym}
              {unit === 'jpy' ? Math.round(avg).toLocaleString('en-US') : avg.toFixed(0)}/วัน
            </text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-ios-secondary">
        {DAY_CATS.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
        <span className="text-ios-secondary">· แกนล่าง = วันที่ของทริป</span>
      </div>
    </div>
  );
}
