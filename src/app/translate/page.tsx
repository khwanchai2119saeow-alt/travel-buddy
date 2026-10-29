'use client';
import { useEffect, useMemo, useState } from 'react';
import { PHRASE_CATS, phrasesFor } from '@/lib/phrases';
import { lookupSigns, type SignHit } from '@/lib/signs';
import { hasVoice, speak, stopSpeaking, ttsSupported } from '@/lib/tts';
import { prepareForOcr } from '@/lib/image';
import { recognize, statusTh } from '@/lib/ocr';
import { Modal, PageHeader, useBlobUrl } from '@/components/ui';
import { myMemory } from '@/lib/translate';
import { countryOf, type CountryInfo } from '@/lib/country';
import { useSettings } from '@/lib/stats';

type Tab = 'phrases' | 'type' | 'sign';

export default function TranslatePage() {
  const C = countryOf(useSettings().country);
  const [tab, setTab] = useState<Tab>('phrases');
  const [show, setShow] = useState<{ ja: string; th: string } | null>(null);
  const [voiceOk, setVoiceOk] = useState(true);

  useEffect(() => {
    if (!ttsSupported()) return setVoiceOk(false);
    const check = () => setVoiceOk(hasVoice(C.ttsLang));
    check();
    window.speechSynthesis.onvoiceschanged = check;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      stopSpeaking();
    };
  }, [C.ttsLang]);

  return (
    <>
      <PageHeader title="แปลภาษา" subtitle={`ไทย → ${C.langName} · ฟังเสียง · แปลป้าย`} />
      <div className="segmented mx-4 mt-1 grid-cols-3">
        {([
          ['phrases', 'วลีสำเร็จรูป'],
          ['type', 'พิมพ์แปล'],
          ['sign', 'แปลป้าย'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'seg-on' : 'seg'} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {!voiceOk && (
        <p className="mx-4 mt-3 rounded-xl bg-ios-orange/10 p-2 text-xs text-ios-orange">
          เครื่องนี้ยังไม่มีเสียงภาษา{C.langName}สำหรับอ่านออกเสียง (ตั้งค่า iPhone → การช่วยการเข้าถึง → เนื้อหาที่ถูกพูด → เสียง → เพิ่มภาษา{C.langName}) ใช้ปุ่ม “โชว์พนักงาน” แทนได้
        </p>
      )}

      {tab === 'phrases' && <Phrases C={C} onShow={setShow} />}
      {tab === 'type' && <Typed C={C} onShow={setShow} />}
      {tab === 'sign' && <SignReader C={C} />}

      <Modal open={!!show} onClose={() => { stopSpeaking(); setShow(null); }} title="โชว์ให้พนักงานดู">
        {show && (
          <div className="text-center">
            <div className="rounded-3xl bg-black p-6 text-white">
              <div className="break-words text-4xl font-bold leading-snug">{show.ja}</div>
            </div>
            <p className="mt-3 text-sm text-ios-secondary">{show.th}</p>
            <button className="btn-primary mt-3 w-full !py-3 text-base" onClick={() => speak(show.ja, C.ttsLang)}>
              🔊 เล่นเสียง
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}

function PhraseCard({ C, ja, th, read, onShow }: { C: CountryInfo; ja: string; th: string; read?: string; onShow: (v: { ja: string; th: string }) => void }) {
  return (
    <div className="card !p-3">
      <div className="text-sm text-ios-secondary">{th}</div>
      <div className="mt-0.5 text-xl font-bold leading-snug">{ja}</div>
      {read && <div className="text-xs text-ios-secondary">อ่านว่า: {read}</div>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn-ghost !py-2" onClick={() => speak(ja, C.ttsLang)}>🔊 ฟัง</button>
        <button className="btn-ghost !py-2" onClick={() => onShow({ ja, th })}>📺 โชว์พนักงาน</button>
      </div>
    </div>
  );
}

function Phrases({ C, onShow }: { C: CountryInfo; onShow: (v: { ja: string; th: string }) => void }) {
  const [cat, setCat] = useState<string>(PHRASE_CATS[0]);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim();
    return phrasesFor(C.code).filter((p) => (s ? p.th.includes(s) || p.text.includes(s) : p.cat === cat));
  }, [cat, q, C.code]);
  return (
    <section className="space-y-3 p-4">
      <input className="input" placeholder="ค้นหาวลี เช่น ห้องน้ำ, แพ้, ลดราคา" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && (
        <div className="hscroll">
          {PHRASE_CATS.map((c) => (
            <button key={c} className={cat === c ? 'chip-on' : 'chip'} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="py-6 text-center text-sm text-ios-secondary">ไม่พบวลี ลองใช้แท็บ “พิมพ์แปล”</p>}
      {list.map((p) => (
        <PhraseCard key={p.th + p.text} C={C} ja={p.text} th={p.th} read={p.read} onShow={onShow} />
      ))}
    </section>
  );
}

function Typed({ C, onShow }: { C: CountryInfo; onShow: (v: { ja: string; th: string }) => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const local = useMemo(() => {
    const s = text.trim();
    return s.length >= 2 ? phrasesFor(C.code).filter((p) => p.th.includes(s)).slice(0, 4) : [];
  }, [text, C.code]);

  async function go() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg('');
    setResult('');
    try {
      setResult(await myMemory(text.trim(), 'th', C.mtLang));
    } catch {
      setMsg('แปลออนไลน์ไม่ได้ (ไม่มีอินเทอร์เน็ต หรือโควตาฟรีวันนี้เต็ม) — ลองดูวลีสำเร็จรูปที่ตรงกันด้านล่างแทน');
    }
    setBusy(false);
  }

  return (
    <section className="space-y-3 p-4">
      <div className="card space-y-2">
        <label className="label">พิมพ์ภาษาไทย</label>
        <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="เช่น ขอที่นั่งริมหน้าต่างได้ไหม" />
        <button className="btn-primary w-full" onClick={go} disabled={busy}>
          {busy ? 'กำลังแปล…' : `แปลเป็น${C.langName} (ต้องมีเน็ต)`}
        </button>
        <p className="text-[11px] text-ios-secondary">เครื่องแปลฟรีอาจคลาดเคลื่อน ประโยคสำคัญควรใช้วลีสำเร็จรูปหรือเช็กกับคนท้องถิ่นอีกครั้ง</p>
      </div>

      {msg && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{msg}</p>}
      {result && <PhraseCard C={C} ja={result} th={text.trim()} onShow={onShow} />}

      {local.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-ios-secondary">วลีสำเร็จรูปที่ใกล้เคียง (ใช้ออฟไลน์ได้)</h3>
          {local.map((p) => (
            <PhraseCard key={p.th + p.text} C={C} ja={p.text} th={p.th} read={p.read} onShow={onShow} />
          ))}
        </>
      )}
    </section>
  );
}

function SignReader({ C }: { C: CountryInfo }) {
  const [file, setFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ status: '', pct: 0 });
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SignHit[]>([]);
  const [online, setOnline] = useState('');
  const [error, setError] = useState('');
  const preview = useBlobUrl(file ?? undefined);

  async function onPick(f?: File | null) {
    if (!f) return;
    setFile(f);
    setText('');
    setHits([]);
    setOnline('');
    setError('');
    setBusy(true);
    setProgress({ status: 'กำลังเตรียมรูป…', pct: 0 });
    try {
      const prepared = await prepareForOcr(f, 1600);
      const t = await recognize(prepared, 'sign', C.ocrLang, (m) => setProgress({ status: statusTh(m.status), pct: Math.round((m.progress || 0) * 100) }));
      const clean = t.replace(/[ \t]+/g, ' ').trim();
      setText(clean);
      setHits(lookupSigns(clean, C.code));
      if (!clean) setError('อ่านข้อความไม่เจอ ลองถ่ายใกล้ขึ้น ตรง ๆ และให้ตัวอักษรชัด');
    } catch {
      setError(`อ่านไม่สำเร็จ: ถ้าเปิดครั้งแรกต้องต่อเน็ตเพื่อโหลดข้อมูลภาษา${C.langName} 1 ครั้งก่อน`);
    }
    setBusy(false);
  }

  async function translateOnline() {
    setError('');
    try {
      setOnline(await myMemory(text.replace(/\s+/g, ' ').trim(), C.mtLang, 'th'));
    } catch {
      setError('แปลออนไลน์ไม่ได้ (ไม่มีเน็ตหรือโควตาเต็ม) — ดูผลจากพจนานุกรมป้ายด้านบนแทน');
    }
  }

  return (
    <section className="space-y-3 p-4">
      <div className="card space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="btn-primary cursor-pointer !py-3">
            📷 ถ่ายป้าย
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
          <label className="btn-ghost cursor-pointer !py-3">
            🖼️ เลือกรูป
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
        </div>
        <p className="text-xs text-ios-secondary">อ่านตัวอักษรจากรูปในเครื่อง แล้วจับคู่กับพจนานุกรมป้ายที่พบบ่อย (ออฟไลน์ได้) ถ้าเจอข้อความยาวค่อยกดแปลออนไลน์</p>
      </div>

      {preview && (
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="ป้าย" className="max-h-64 w-full rounded-xl object-contain" />
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

      {error && <p className="rounded-xl bg-ios-orange/10 p-2 text-sm text-ios-orange">{error}</p>}

      {!busy && file && (text || hits.length > 0) && (
        <div className="card space-y-3">
          {hits.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-bold">🪧 คำที่เจอบนป้าย</h3>
              <ul className="space-y-1">
                {hits.map((h) => (
                  <li key={h.ja} className="flex items-baseline justify-between gap-3 rounded-xl bg-ios-fill px-3 py-2">
                    <span className="text-lg font-bold">{h.ja}</span>
                    <span className="text-right text-sm text-ios-label">{h.th}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ios-secondary">ไม่พบคำป้ายที่รู้จักในพจนานุกรม ลองกดแปลออนไลน์ด้านล่าง</p>
          )}

          <div>
            <div className="label">ข้อความที่อ่านได้</div>
            <p className="whitespace-pre-wrap rounded-xl bg-ios-fill p-2 text-sm">{text}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost" onClick={() => speak(text, C.ttsLang)}>🔊 อ่านออกเสียง</button>
              <button className="btn-primary flex-1" onClick={translateOnline}>🌐 แปลเป็นไทย (ต้องมีเน็ต)</button>
            </div>
            {online && <p className="mt-2 rounded-xl bg-ios-blue/10 p-3 text-sm text-ios-blue">{online}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
