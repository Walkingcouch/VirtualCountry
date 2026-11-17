'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import DemoMap, { type Pin } from '@/components/DemoMap';
import ItemChips from '@/components/ItemChips';

export default function MapPage() {
  const { dir } = useSession();
  const { items, loading } = useItems();
  const [sel, setSel] = useState<string | null>(null);
  const placed = items.filter((i) => i.payload.place);
  const it = items.find((i) => i.row.id === sel);
  const pins: Pin[] = placed.map((i) => ({
    id: i.row.id, x: i.payload.place!.x, y: i.payload.place!.y, label: i.payload.title,
    tone: i.row.paused ? 'muted' : i.payload.restrictions?.gender === 'women' ? 'women' : i.payload.restrictions?.gender === 'men' ? 'men' : i.payload.kind === 'observation' ? 'teal' : 'gold',
  }));

  return (
    <div>
      <div className="label mb-1">Pins are placed on this device after unlocking <span className="rule" /></div>
      <h1 className="font-head font-extrabold text-3xl mb-4">MAP OF <span className="text-gold-text">COUNTRY</span></h1>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        
        <div>
          <DemoMap pins={pins} onPinClick={setSel} height={640} />
          {!loading && placed.length === 0 && <p className="text-mute text-sm mt-2">Nothing is on the map yet. Add a place when you record a story and it will show here.</p>}
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