'use client';
// แผนที่ Leaflet + OpenStreetMap (ฟรี ไม่ต้องใช้ API key) — โหลดผ่าน next/dynamic แบบปิด SSR
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place } from '@/lib/db';
import { TILE_MAX_ZOOM, TILE_URL } from '@/lib/constants';

export interface MapApi {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** แคชไทล์ของพื้นที่ที่เห็นอยู่ไว้ใช้ออฟไลน์ (จำกัดจำนวนน้อย ๆ ตามนโยบายของ OSM) คืนจำนวนไทล์ที่โหลด */
  cacheView: () => Promise<number>;
}

interface Props {
  places: Place[];
  center: [number, number]; // จุดเริ่มเมื่อยังไม่มีหมุด (เมืองหลักของประเทศ)
  showRoute: boolean;
  activeUid?: string | null;
  draft?: { lat: number; lng: number } | null;
  picking?: boolean;
  onSelect?: (uid: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onReady?: (api: MapApi) => void;
}

function tileUrls(template: string, b: L.LatLngBounds, z: number): string[] {
  const n = 2 ** z;
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const x0 = tx(b.getWest());
  const x1 = tx(b.getEast());
  const y0 = ty(b.getNorth());
  const y1 = ty(b.getSouth());
  const urls: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      urls.push(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
  }
  return urls;
}

export default function MapView(props: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const fitKey = useRef('');

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, { zoomControl: false, maxZoom: TILE_MAX_ZOOM }).setView(propsRef.current.center, 12);
    L.tileLayer(TILE_URL, {
      maxZoom: TILE_MAX_ZOOM,
      crossOrigin: true,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => propsRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    propsRef.current.onReady?.({
      flyTo: (lat, lng, zoom = 15) => map.flyTo([lat, lng], zoom, { duration: 0.6 }),
      cacheView: async () => {
        const b = map.getBounds();
        const z = Math.max(10, Math.min(map.getZoom(), 16));
        const tpl = TILE_URL;
        let urls = tileUrls(tpl, b, z);
        if (urls.length < 40) urls = urls.concat(tileUrls(tpl, b, z + 1));
        urls = urls.slice(0, 80); // เพดานกันโหลดหนักเกินไป
        let ok = 0;
        for (const u of urls) {
          try {
            const r = await fetch(u, { mode: 'cors' });
            if (r.ok) ok++;
          } catch {
            /* ออฟไลน์/ถูกบล็อก ข้าม */
          }
          await new Promise((res) => setTimeout(res, 120));
        }
        return ok;
      },
    });

    return () => {
      ro.disconnect();
      // ออกจากหน้าระหว่างกำลังซูม: Leaflet ตั้งเวลาจบการซูมไว้ 250ms ยกเลิกไม่ได้ และจะ error หลังแผนที่ถูกลบ
      // ตั้งสถานะว่าซูมจบแล้ว ตัวจับเวลานั้นจะออกไปเฉย ๆ
      map.stop();
      (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
      map.remove();
      fitKey.current = ''; // แผนที่ใหม่ต้องซูมให้เห็นหมุดอีกครั้ง
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // อัปเดตหมุด/เส้นทางเมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const pts: L.LatLngTuple[] = [];
    // เลขหมุดนับใหม่ทุกวัน ให้ตรงกับเลขในรายการด้านล่างแผนที่
    const spotNoByDay = new Map<number, number>();
    for (const p of props.places) {
      const spotNo = (spotNoByDay.get(p.day) ?? 0) + (p.kind === 'spot' ? 1 : 0);
      spotNoByDay.set(p.day, spotNo);
      const label = p.kind === 'hotel' ? '🏨' : p.visited ? '✓' : String(spotNo);
      const cls = ['pin', p.kind === 'hotel' ? 'pin-hotel' : '', p.visited ? 'pin-visited' : '', p.uid === props.activeUid ? 'pin-active' : '']
        .filter(Boolean)
        .join(' ');
      const icon = L.divIcon({
        html: `<div class="${cls}"><span>${label}</span></div>`,
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 36],
      });
      const marker = L.marker([p.lat, p.lng], { icon, keyboard: false });
      marker.on('click', () => propsRef.current.onSelect?.(p.uid));
      marker.addTo(layer);
      pts.push([p.lat, p.lng]);
    }

    if (props.showRoute && pts.length > 1) {
      L.polyline(pts, { color: '#e11d48', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(layer);
    }
    if (props.draft) {
      L.circleMarker([props.draft.lat, props.draft.lng], { radius: 10, color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.6 }).addTo(layer);
    }

    const key = props.places.map((p) => p.uid).join(',');
    if (key !== fitKey.current) {
      fitKey.current = key;
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
      else if (pts.length === 1) map.setView(pts[0], 14);
      else map.setView(propsRef.current.center, 12); // ยังไม่มีหมุด (เช่นเพิ่งสลับไปทริปประเทศอื่น)
    }
  }, [props.places, props.activeUid, props.draft, props.showRoute]);

  // เคอร์เซอร์ตอนโหมดปักหมุด
  useEffect(() => {
    const c = mapRef.current?.getContainer();
    if (c) c.style.cursor = props.picking ? 'crosshair' : '';
  }, [props.picking]);

  return <div ref={elRef} className="h-full w-full" />;
}
