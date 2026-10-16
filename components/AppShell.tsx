'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { ItemsProvider, useItems } from '@/lib/items-context';
import { NotesProvider, useNotes } from '@/lib/notes-context';
import Unlock from '@/components/Unlock';
import Guide, { openGuide } from '@/components/Guide';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import type { Area } from '@/lib/guide';

const MAIN = [
  { href: '/record', label: 'Record', icon: 'record' },
  { href: '/stories', label: 'Stories', icon: 'stories' },
  { href: '/map', label: 'Map', icon: 'map' },
  { href: '/messages', label: 'Messages', icon: 'messages' },
  { href: '/releases', label: 'Releases', icon: 'releases' },
  { href: '/community', label: 'Community', icon: 'community' },
  { href: '/legacy', label: 'Legacy', icon: 'legacy' },
];
// Phones: four destinations and "More". Everything else lives in the More sheet.
const BOTTOM = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/record', label: 'Record', icon: 'record' },
  { href: '/stories', label: 'Stories', icon: 'stories' },
  { href: '/messages', label: 'Messages', icon: 'messages' },
];
const MORE = [
  { href: '/map', label: 'Map', icon: 'map' },
  { href: '/releases', label: 'Releases', icon: 'releases' },
  { href: '/community', label: 'Community', icon: 'community' },
  { href: '/legacy', label: 'Legacy', icon: 'legacy' },
  { href: '/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/me', label: 'Me', icon: 'me' },
];

function areaOf(path: string): Area {
  if (path === '/') return 'home';
  if (path.startsWith('/stories/')) return 'story';
  const seg = path.split('/')[1] as Area;
  return (['record', 'stories', 'map', 'messages', 'releases', 'community', 'me', 'legacy', 'notifications'] as Area[]).includes(seg) ? seg : 'general';
}

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { org, orgs, setOrgId, lock, keyAlerts, displayName } = useSession();
  const { deny } = useItems();
  const { notes } = useNotes();
  const [more, setMore] = useState(false);
  const active = orgs.filter((o) => o.status === 'active');
  const unreadMessages = notes.filter((n) => n.kind === 'message').length;
  const moreCount = notes.filter((n) => n.kind !== 'message').length;

  useEffect(() => { setMore(false); }, [path]);

  return (
    <div className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-10">
      <header className="bg-ink text-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-[72px] flex items-center gap-3 lg:gap-4">
          <Link href="/" aria-label="Home" className="shrink-0"><Logo className="h-9 sm:h-11" /></Link>
          <div className="hidden md:block h-7 w-px bg-white/20" />
          <div className="hidden sm:block min-w-0">
            {active.length > 1 ? (
              <select className="bg-ink text-gold font-head font-semibold text-xs tracking-[.2em] uppercase border border-white/20 rounded px-2 py-1 max-w-[14rem]" value={org?.id ?? ''} onChange={(e) => setOrgId(e.target.value)} aria-label="Community">
                {active.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <span className="font-head font-semibold text-xs tracking-[.2em] uppercase text-gold truncate block">{org?.name ?? 'No community yet'}</span>
            )}
          </div>
          <nav className="hidden lg:flex items-center gap-4 xl:gap-5 ml-auto" aria-label="Main">
            {MAIN.map((n) => (
              <Link key={n.href} href={n.href} className={`relative font-head font-semibold text-[.68rem] tracking-[.16em] uppercase pb-1 border-b-2 ${isActive(path, n.href) ? 'border-gold text-gold' : 'border-transparent text-white/85 hover:text-white'}`}>
                {n.label}
                {n.href === '/messages' && unreadMessages > 0 && <span className="absolute -top-2 -right-3 bg-gold text-ink rounded-full text-[10px] min-w-4 h-4 px-1 flex items-center justify-center">{unreadMessages}</span>}
              </Link>
            ))}
          </nav>
          <div className="ml-auto lg:ml-3 flex items-center gap-1 sm:gap-2">
            <button onClick={openGuide} className="lg:hidden p-2 text-white/85 hover:text-gold" aria-label="Open the Guide (help)"><Icon name="help" /></button>
            <Link href="/notifications" className="relative p-2 text-white/85 hover:text-gold" aria-label={`Notifications${notes.length ? `, ${notes.length} new` : ''}`}>
              <Icon name="bell" />
              {notes.length > 0 && <span className="absolute top-0.5 right-0.5 bg-gold text-ink rounded-full text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">{notes.length}</span>}
            </Link>
            <Link href="/me" className="hidden sm:flex items-center gap-1 text-white/70 hover:text-white text-sm px-1" title="Your account">
              <Icon name="me" className="w-5 h-5" /><span className="hidden md:inline max-w-[9rem] truncate">{displayName.split(' (')[0]}</span>
            </Link>
            <button onClick={lock} className="btn btn-gold !min-h-9 !py-1.5 !px-3 flex items-center gap-1" title="Lock: closes your private space on this device straight away. Your passphrase opens it again.">
              <Icon name="lock" className="w-4 h-4" /><span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-gold via-gold/40 to-transparent" />
      </header>
      {keyAlerts.length > 0 && (
        <div className="bg-[#FFF4DE] border-b border-[#F0D9A6] text-sm px-4 py-2 text-center">
          Security key changed for {keyAlerts.join(', ')}. This is normal if they have a new phone. Check with them if you are not sure.
        </div>
      )}
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>

      {more && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMore(false)}>
          <div className="absolute bottom-[calc(64px+env(safe-area-inset-bottom))] inset-x-0 bg-ink text-white rounded-t-2xl p-4 grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()} role="menu">
            {MORE.map((n) => {
              const count = n.href === '/notifications' ? notes.length : 0;
              return (
                <Link key={n.href} href={n.href} role="menuitem" className={`relative flex flex-col items-center gap-1 rounded-xl py-3 ${isActive(path, n.href) ? 'bg-white/10 text-gold' : 'text-white/85'}`}>
                  <Icon name={n.icon} className="w-7 h-7" /><span className="text-xs">{n.label}</span>
                  {count > 0 && <span className="absolute top-1 right-3 bg-gold text-ink rounded-full text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">{count}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-ink text-white grid grid-cols-5 border-t border-white/10 pb-[env(safe-area-inset-bottom)]" aria-label="Main">
        {BOTTOM.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined} className={`relative flex flex-col items-center justify-center h-16 gap-0.5 ${isActive(path, n.href) ? 'text-gold' : 'text-white/75'}`}>
            <Icon name={n.icon} />
            <span className="text-[11px] leading-none">{n.label}</span>
            {n.href === '/messages' && unreadMessages > 0 && <span className="absolute top-2 left-1/2 ml-2 bg-gold text-ink rounded-full text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">{unreadMessages}</span>}
          </Link>
        ))}
        <button onClick={() => setMore(!more)} aria-expanded={more} className={`relative flex flex-col items-center justify-center h-16 gap-0.5 ${more || MORE.some((n) => isActive(path, n.href)) ? 'text-gold' : 'text-white/75'}`}>
          <Icon name="more" />
          <span className="text-[11px] leading-none">More</span>
          {moreCount > 0 && <span className="absolute top-2 left-1/2 ml-2 bg-gold text-ink rounded-full text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">{moreCount}</span>}
        </button>
      </nav>
      <Guide area={areaOf(path)} deny={deny} />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const path = usePathname();

  // Pages that work without signing in, or are part of signing in
  const isPublic = path === '/login' || path === '/setup' || path.startsWith('/public');

  useEffect(() => {
    if (!isPublic) {
      if (status === 'signed_out') router.replace('/login');
      if (status === 'needs_setup') router.replace('/setup');
    }
  }, [status, router, isPublic]);

  if (isPublic) return <>{children}</>;

  if (status === 'loading' || status === 'signed_out' || status === 'needs_setup') {
    return <div className="min-h-screen bg-ink flex items-center justify-center"><Logo className="h-12 opacity-80" /></div>;
  }

  if (status === 'locked') return <Unlock />;

  return <ItemsProvider><NotesProvider><Shell>{children}</Shell></NotesProvider></ItemsProvider>;
}
