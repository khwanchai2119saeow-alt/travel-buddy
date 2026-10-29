'use client';
// ป๊อปอัปที่เด้งขึ้นเมื่อแตะหมุดบนแผนที่: ชื่อ + รูปหลายรูป (เลื่อนดูได้) + โน้ต + ปุ่มเปิดนำทาง
import { useMemo } from 'react';
import type { Place } from '@/lib/db';
import { appleNavigationUrl, appleViewUrl, navigationUrl, viewUrl } from '@/lib/geo';
import { activeCountry } from '@/lib/format';
import { fmtCur } from '@/lib/format';
import { Modal } from './ui';
import PhotoGallery from './PhotoGallery';
import { placePhotos } from '@/lib/photos';

interface Props {
  place: Place;
  spentJpy: number;
  dayText: string;
  onClose: () => void;
  onEdit: () => void;
  onToggleVisited: () => void;
}

export default function PlaceModal({ place, spentJpy, dayText, onClose, onEdit, onToggleVisited }: Props) {
  const photos = useMemo(() => placePhotos(place), [place]);
  const isHotel = place.kind === 'hotel';
  const C = activeCountry();
  const apple = { href: appleNavigationUrl(place.lat, place.lng), label: '🧭 นำทางด้วย Apple Maps' };
  const google = { href: navigationUrl(place.lat, place.lng), label: '🧭 นำทางด้วย Google Maps' };
  const [main, alt] = C.nav === 'apple' ? [apple, google] : [google, apple];

  return (
    <Modal open onClose={onClose} title={isHotel ? '🏨 ที่พัก' : '📍 สถานที่'}>
      {photos.length ? (
        <div className="mb-3">
          <PhotoGallery photos={photos} alt={place.title} />
        </div>
      ) : (
        <div className="mb-3 flex h-28 items-center justify-center rounded-2xl bg-ios-fill text-5xl">{isHotel ? '🏨' : '📍'}</div>
      )}

      <h3 className="text-xl font-bold leading-snug">{place.title}</h3>
      <p className="mt-0.5 text-sm text-ios-secondary">
        {dayText}
        {place.time ? ` · ${place.time} น.` : ''}
        {place.visited
          ? ` · ✅ ไปแล้ว${place.visitedAt ? ` ${new Date(place.visitedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : ''}${place.visitedAuto ? ' (อัตโนมัติจาก GPS)' : ''}`
          : ''}
      </p>

      {isHotel && (place.bookingCode || place.checkIn) && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-ios-blue/10 p-3 text-sm">
          <div>
            <div className="text-[11px] font-semibold text-ios-blue">รหัสจอง</div>
            <div className="break-all font-bold">{place.bookingCode || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ios-blue">เช็กอิน</div>
            <div className="font-bold">{place.checkIn || '—'}</div>
          </div>
        </div>
      )}

      {place.note && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-ios-fill p-3 text-sm text-ios-label">{place.note}</p>}

      {spentJpy > 0 && <p className="mt-3 text-sm text-ios-secondary">💴 ใช้จ่ายที่นี่ไปแล้ว <b>{fmtCur(spentJpy)}</b></p>}

      <a href={main.href} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 w-full !py-3 text-base">
        {main.label}
      </a>
      <a href={alt.href} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-[15px] text-ios-blue">
        {alt.label.replace('🧭 ', 'หรือ')}
        {C.nav === 'apple' ? ' (ในจีนต้องมี VPN)' : ''}
      </a>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="btn-ghost" onClick={onToggleVisited}>
          {place.visited ? '↩︎ ยังไม่ไป' : '✅ ไปแล้ว'}
        </button>
        <a className="btn-ghost" href={C.nav === 'apple' ? appleViewUrl(place.lat, place.lng, place.title) : viewUrl(place.lat, place.lng)} target="_blank" rel="noopener noreferrer">
          🔎 ดูแผนที่
        </a>
        <button className="btn-ghost" onClick={onEdit}>
          ✏️ แก้ไข
        </button>
      </div>
    </Modal>
  );
}
