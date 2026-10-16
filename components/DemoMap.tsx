'use client';
/**
 * Demo Country: an invented map drawn for the demo. It is not a real place.
 * A real community chooses its own base view: terrain, satellite, 360°, or its own painted map of Country.
 * Coordinates run 0–1000 across and 0–700 down.
 */
import { useRef } from 'react';

export interface Pin { id: string; x: number; y: number; label: string; tone?: 'gold' | 'teal' | 'women' | 'men' | 'muted' }

const PLACES = [
  { x: 310, y: 260, name: 'Seven Springs' },
  { x: 620, y: 180, name: 'Red Ridge' },
  { x: 480, y: 420, name: 'Long Creek' },
  { x: 220, y: 470, name: 'Ironbark Flat' },
  { x: 760, y: 330, name: 'Echo Gorge' },
  { x: 650, y: 560, name: 'Saltpan' },
  { x: 400, y: 150, name: 'Windmill Bore' },
];

const toneColour = { gold: '#DDA66A', teal: '#2FB5C0', women: '#B5527F', men: '#3B6F9E', muted: '#8A939C' };

export default function DemoMap({ pins = [], onPick, picked, blurCell, height = 420, onPinClick }: {
  pins?: Pin[];
  onPick?: (p: { x: number; y: number }) => void;
  picked?: { x: number; y: number } | null;
  blurCell?: { bx: number; by: number; size: number } | null;
  height?: number;
  onPinClick?: (id: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onPick({ x: Math.round(((e.clientX - r.left) / r.width) * 1000), y: Math.round(((e.clientY - r.top) / r.height) * 700) });
  };
  return (
    <div className="relative w-full overflow-hidden rounded border border-line bg-deep" style={{ maxHeight: height }}>
      <svg ref={ref} viewBox="0 0 1000 700" className={`block w-full h-auto ${onPick ? 'cursor-crosshair' : ''}`} onClick={click} role="img" aria-label="Map of Demo Country, an invented place">
        <defs>
          <radialGradient id="land" cx="45%" cy="45%" r="70%">
            <stop offset="0" stopColor="#5B3A22" />
            <stop offset="0.6" stopColor="#3A2618" />
            <stop offset="1" stopColor="#1C1612" />
          </radialGradient>
        </defs>
        <rect width="1000" height="700" fill="#07141A" />
        {/* land */}
        <path d="M120,330 C110,210 210,110 360,95 C470,80 560,60 690,95 C820,130 905,230 890,350 C878,470 820,590 690,630 C560,668 400,660 290,620 C170,578 128,450 120,330 Z" fill="url(#land)" stroke="#DDA66A" strokeOpacity=".35" strokeWidth="2" />
        {/* contour lines */}
        {[0.88, 0.74, 0.6, 0.46].map((s, i) => (
          <path key={i} transform={`translate(${500 - 500 * s} ${360 - 360 * s}) scale(${s})`} d="M120,330 C110,210 210,110 360,95 C470,80 560,60 690,95 C820,130 905,230 890,350 C878,470 820,590 690,630 C560,668 400,660 290,620 C170,578 128,450 120,330 Z" fill="none" stroke="#DDA66A" strokeOpacity={0.12 + i * 0.03} strokeWidth="1.2" />
        ))}
        {/* ridge */}
        <path d="M520,175 C570,150 640,160 700,190 C740,210 780,250 800,300" fill="none" stroke="#C8792B" strokeWidth="5" strokeLinecap="round" strokeOpacity=".7" />
        {/* creek */}
        <path d="M300,265 C340,330 410,380 480,420 C560,465 610,520 650,560" fill="none" stroke="#2FB5C0" strokeWidth="4" strokeOpacity=".8" strokeLinecap="round" />
        <path d="M480,420 C430,450 330,470 230,470" fill="none" stroke="#2FB5C0" strokeWidth="2.5" strokeOpacity=".55" strokeLinecap="round" />
        {/* waterholes */}
        <circle cx="310" cy="260" r="16" fill="#2FB5C0" fillOpacity=".55" />
        <ellipse cx="650" cy="560" rx="46" ry="22" fill="#E9DFCF" fillOpacity=".25" />
        {/* place labels */}
        {PLACES.map((p) => (
          <g key={p.name}>
            <circle cx={p.x} cy={p.y} r="4" fill="#E9DFCF" fillOpacity=".7" />
            <text x={p.x + 10} y={p.y - 10} fill="#E9DFCF" fillOpacity=".75" fontSize="18" fontFamily="var(--font-montserrat), sans-serif" fontWeight="600" letterSpacing="1">{p.name}</text>
          </g>
        ))}
        {blurCell && (
          <rect x={blurCell.bx - blurCell.size / 2} y={blurCell.by - blurCell.size / 2} width={blurCell.size} height={blurCell.size} fill="#DDA66A" fillOpacity=".18" stroke="#DDA66A" strokeDasharray="6 6" />
        )}
        {pins.map((p) => (
          <g key={p.id} onClick={(e) => { e.stopPropagation(); onPinClick?.(p.id); }} className={onPinClick ? 'cursor-pointer' : ''}>
            <circle cx={p.x} cy={p.y} r="13" fill={toneColour[p.tone ?? 'gold']} stroke="#10151B" strokeWidth="3" />
            <title>{p.label}</title>
          </g>
        ))}
        {picked && <circle cx={picked.x} cy={picked.y} r="14" fill="none" stroke="#fff" strokeWidth="4" />}
        <text x="20" y="680" fill="#E9DFCF" fillOpacity=".55" fontSize="16" fontFamily="sans-serif">Demo Country · an invented map for demonstration only</text>
      </svg>
    </div>
  );
}

export const DEMO_PLACES = PLACES;
