'use client';
import { useState } from 'react';
import { activeCountry, fmtCur, fmtThb } from '@/lib/format';

/** เครื่องคิดเลขหน้าร้าน: พิมพ์ราคาป้ายเป็นเงินท้องถิ่น → เห็นเป็นบาททันที (ญี่ปุ่นเลือกบวกภาษีได้) */
export default function PriceCalc({ rate }: { rate: number }) {
  const [price, setPrice] = useState('');
  const [tax, setTax] = useState(0);
  const C = activeCountry();
  const jpy = parseFloat(price.replace(/,/g, '')) || 0;
  const effTax = C.taxes.includes(tax) ? tax : 0; // จีนไม่มีตัวเลือกภาษี
  const withTax = jpy * (1 + effTax / 100);
  return (
    <div className="card">
      <h2 className="mb-2 text-[13px] font-semibold text-ios-orange">คิดราคาหน้าร้าน {C.sym} → ฿</h2>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-secondary">{C.sym}</span>
          <input
            className="input !pl-7"
            inputMode="decimal"
            placeholder="ราคาที่ป้าย"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-ios-red">{rate > 0 ? fmtThb(withTax * rate) : '—'}</div>
          {effTax > 0 && jpy > 0 && <div className="text-[11px] text-ios-secondary">รวมภาษี {fmtCur(withTax)}</div>}
        </div>
      </div>
      {C.taxes.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-[13px] text-ios-secondary">บวกภาษี</span>
          {[0, ...C.taxes].map((t) => (
            <button key={t} className={effTax === t ? 'chip-on' : 'chip'} onClick={() => setTax(t)}>
              {t === 0 ? 'ไม่บวก' : `${t}%`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
