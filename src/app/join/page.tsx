'use client';
// หน้าเข้าร่วมทริปจากลิงก์/QR เชิญ: ดูข้อมูลทริป → เลือกว่าเราคือใคร (หรือเพิ่มชื่อ) → เข้าร่วม
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodeInvite, joinTrip, type InvitePayload } from '@/lib/invite';
import { countryOf } from '@/lib/country';
import { tripRangeText } from '@/lib/format';
import { PageHeader } from '@/components/ui';

export default function JoinPage() {
  const router = useRouter();
  const [p, setP] = useState<InvitePayload | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [me, setMe] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [standalone, setStandalone] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash;
      setCode(hash.replace(/^#t=/, ''));
      setP(decodeInvite(hash));
    };
    read();
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true);
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  async function join() {
    if (!p) return;
    if (me === 'new' && !newName.trim()) return;
    await joinTrip(p, me === 'new' ? { newName: newName.trim() } : me);
    router.push('/');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (p === undefined) return <PageHeader title="เข้าร่วมทริป" />;

  if (!p) {
    return (
      <>
        <PageHeader back="/trips/" title="เข้าร่วมทริป" />
        <div className="card mx-4 text-[15px] text-ios-secondary">ลิงก์เชิญนี้อ่านไม่ได้ หรือไม่ครบ — ขอให้เพื่อนส่ง QR/ลิงก์ใหม่อีกครั้ง</div>
      </>
    );
  }

  const C = countryOf(p.trip.country);
  return (
    <>
      <PageHeader back="/trips/" title="เข้าร่วมทริป" subtitle="เพื่อนชวนคุณเข้าทริปนี้" />
      <section className="space-y-3 px-4 pb-6">
        {!standalone && (
          <div className="rounded-widget bg-ios-orange/10 p-4 text-[15px]">
            <div className="font-semibold text-ios-orange">เปิดอยู่ใน Safari</div>
            <p className="mt-1 text-ios-label/80">
              ถ้าติดตั้งแอปไว้ที่หน้าจอโฮมแล้ว ให้กด “คัดลอกลิงก์เชิญ” แล้วไปเปิดแอป → ทริปของฉัน → เข้าร่วมทริปของเพื่อน → วางลิงก์ (iPhone แยกข้อมูลของ Safari กับแอปบนหน้าจอโฮม)
            </p>
            <button className="btn-ghost mt-2 w-full" onClick={copyCode}>
              {copied ? '✓ คัดลอกแล้ว' : 'คัดลอกลิงก์เชิญ'}
            </button>
            <p className="mt-2 text-[12px] text-ios-secondary">ยังไม่ได้ติดตั้ง? เข้าร่วมด้านล่างได้เลย แล้วค่อยกด แชร์ → เพิ่มไปยังหน้าจอโฮม</p>
          </div>
        )}

        <div className="card flex items-center gap-3">
          <span className="text-4xl leading-none">{C.flag}</span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold">{p.trip.name}</span>
            <span className="block text-[13px] text-ios-secondary">
              {C.name} · {tripRangeText(p.trip)} · {p.trip.splitMode === 'split' ? 'หารกัน' : 'กระเป๋าเงินร่วม'}
            </span>
          </span>
        </div>

        <div className="section-title !px-1">คุณคือใครในทริปนี้</div>
        <div className="ios-list">
          {p.trip.members.map((m) => (
            <button key={m.id} className="ios-row w-full text-left" onClick={() => setMe(m.id)}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[13px] ${me === m.id ? 'bg-ios-blue text-white' : 'ring-1 ring-ios-separator'}`}>{me === m.id ? '✓' : ''}</span>
              <span className="flex-1">{m.name}</span>
            </button>
          ))}
          <button className="ios-row w-full text-left" onClick={() => setMe('new')}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[13px] ${me === 'new' ? 'bg-ios-blue text-white' : 'ring-1 ring-ios-separator'}`}>{me === 'new' ? '✓' : ''}</span>
            <span className="flex-1 text-ios-blue">ไม่มีชื่อฉัน — เพิ่มชื่อใหม่</span>
          </button>
        </div>
        {me === 'new' && <input className="input" placeholder="ชื่อของคุณ" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />}

        <button className="btn-primary w-full !py-3" onClick={join} disabled={!me || (me === 'new' && !newName.trim())}>
          เข้าร่วมทริปนี้
        </button>
        <p className="px-1 text-[12px] text-ios-secondary">
          เข้าร่วมแล้วจะเห็นข้อมูลทริปและรายชื่อ ส่วนค่าใช้จ่ายและแผนเที่ยวของเพื่อน ให้เพื่อนกด “ส่งอัปเดตให้กลุ่ม” แล้วคุณกด “รับอัปเดตจากเพื่อน”
        </p>
        <p className="break-all px-1 text-[10px] text-ios-tertiary">รหัส: {code.slice(0, 24)}…</p>
      </section>
    </>
  );
}
