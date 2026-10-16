/** Simple line icons used in the menus. */
const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
  record: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zm-7 9a7 7 0 0014 0M12 19v3',
  stories: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0v16M8 7h7',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  messages: 'M4 5h16v11H8l-4 4z',
  releases: 'M5 12l4 4 10-10',
  community: 'M8 11a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-5c3 0 8 1 8 5',
  legacy: 'M12 21V10m0 0c0-4-3-6-7-6 0 4 3 6 7 6zm0 0c0-4 3-6 7-6 0 4-3 6-7 6zM7 21h10',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zm4 4h4',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9c0-4 4-6 8-6s8 2 8 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
  help: 'M9 9a3 3 0 115 2c-1 1-2 1.5-2 3m0 3h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
};

export default function Icon({ name, className = 'w-6 h-6' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  );
}
