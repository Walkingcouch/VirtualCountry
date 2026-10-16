'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import DemoMap, { type Pin } from '@/components/DemoMap';
import ItemChips from '@/components/ItemChips';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface ExtendedPin extends Pin {
  lat?: number;
  lng?: number;
}

export default function MapPage() {
  const { dir } = useSession();
  const { items } = useItems();
  const [sel, setSel] = useState<string | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  
  const placed = items.filter((i) => i.payload.place);
  const it = items.find((i) => i.row.id === sel);

  // Check if we have real coordinates (lat/lng) in the payload
  const useRealMap = placed.some(i => {
    const place = i.payload.place as { lat?: number } | null;
    return place?.lat !== undefined;
  });

  const pins: ExtendedPin[] = placed.map((i) => {
    const place = i.payload.place as { x: number; y: number; lat?: number; lng?: number };
    return {
      id: i.row.id, 
      x: place.x, 
      y: place.y, 
      lat: place.lat, 
      lng: place.lng, 
      label: i.payload.title,
      tone: i.row.paused ? 'muted' : i.payload.restrictions?.gender === 'women' ? 'women' : i.payload.restrictions?.gender === 'men' ? 'men' : i.payload.kind === 'observation' ? 'teal' : 'gold',
    };
  });

  useEffect(() => {
    if (!useRealMap || !mapContainer.current || mapInstance.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_KEY || '';
    
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [132.26, -14.46],
      zoom: 6
    });

    mapInstance.current = map;

    // Render custom pins onto the native map
    pins.forEach((p) => {
      if (p.lat !== undefined && p.lng !== undefined) {
        const el = document.createElement('div');
        el.className = `w-4 h-4 rounded-full cursor-pointer border-2 border-ink ${
          p.tone === 'gold' ? 'bg-[#DDA66A]' : 
          p.tone === 'teal' ? 'bg-[#2FB5C0]' : 
          p.tone === 'women' ? 'bg-[#B5527F]' : 
          p.tone === 'men' ? 'bg-[#3B6F9E]' : 'bg-[#8A939C]'
        }`;
        
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSel(p.id);
        });

        new mapboxgl.Marker(el)
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      }
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [useRealMap, pins]);

  return (
    <div>
      <div className="label mb-1">Pins are placed on this device after unlocking <span className="rule" /></div>
      <h1 className="font-head font-extrabold text-3xl mb-4">MAP OF <span className="text-gold-text">COUNTRY</span></h1>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        
        {/* Conditional Map Rendering */}
        <div className="rounded overflow-hidden border border-white/10 relative" style={{ height: 640 }}>
          {useRealMap ? (
            <div ref={mapContainer} className="w-full h-full" />
          ) : (
            <DemoMap pins={pins} onPinClick={setSel} height={640} />
          )}
        </div>

        <div className="space-y-3">
          <div className="card p-4 text-sm">
            <div className="font-head font-semibold mb-2">Key</div>
            <div className="grid grid-cols-2 gap-1">
              <span><span style={{ color: '#DDA66A' }}>●</span> Story</span>
              <span><span style={{ color: '#2FB5C0' }}>●</span> Observation</span>
              <span><span style={{ color: '#B5527F' }}>●</span> Women&apos;s</span>
              <span><span style={{ color: '#3B6F9E' }}>●</span> Men&apos;s</span>
              <span><span style={{ color: '#8A939C' }}>●</span> Paused</span>
            </div>
            <p className="text-mute mt-2">You only see places for items your keys can open.</p>
          </div>
          {it ? (
            <div className="card p-4">
              <h2 className="font-head font-semibold mb-2">{it.payload.title}</h2>
              <ItemChips it={it} groups={dir?.groups ?? []} />
              <Link href={`/stories/${it.row.id}`} className="btn btn-gold w-full mt-3">Open</Link>
            </div>
          ) : <p className="text-mute text-sm">Tap a pin to see the item.</p>}
        </div>
      </div>
    </div>
  );
}