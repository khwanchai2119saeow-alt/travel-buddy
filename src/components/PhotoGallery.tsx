'use client';
// แกลเลอรีรูปแบบเลื่อนซ้าย-ขวา (scroll-snap) พร้อมจุดบอกตำแหน่ง — ใช้ในป๊อปอัปหมุดสถานที่
import { useEffect, useRef, useState } from 'react';

function useBlobUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = blobs.map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [blobs]);
  return urls;
}

export default function PhotoGallery({ photos, alt, className = 'h-56' }: { photos: Blob[]; alt: string; className?: string }) {
  const urls = useBlobUrls(photos);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [photos]);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  if (!urls.length) return null;
  return (
    <div className="relative">
      <div ref={trackRef} onScroll={onScroll} className={`hscroll snap-x snap-mandatory !gap-0 overflow-x-auto rounded-2xl ${className}`}>
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt={`${alt} รูปที่ ${i + 1}`} className="h-full w-full shrink-0 snap-center object-cover" draggable={false} />
        ))}
      </div>
      {urls.length > 1 && (
        <>
          <span className="glass absolute right-2 top-2 rounded-full px-2 py-0.5 text-[12px] font-semibold">
            {index + 1}/{urls.length}
          </span>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {urls.map((u, i) => (
              <button
                key={u}
                onClick={() => goTo(i)}
                aria-label={`ดูรูปที่ ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
