'use client';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';

export default function Home() {
  const { displayName, org, orgs, cas, standing, userId } = useSession();
  const { items, loading } = useItems();
  const first = displayName.split(/[\s(]/)[0];
  const mine = standing.get(userId ?? '') ?? new Set();
  const pending = orgs.filter((o) => o.status === 'pending');

  if (!org) {
    return (
      <div className="max-w-xl">
        <div className="label mb-2">Welcome</div>
        <h1 className="font-head font-extrabold text-3xl mb-3">HELLO, <span className="text-gold-text">{first.toUpperCase()}</span></h1>
        {pending.length ? (
          <p>Your request to join <b>{pending.map((p) => p.name).join(', ')}</b> is waiting for the Community Administrator. They confirm members with the community before anything is shared with you.</p>
        ) : (
          <p>You are not a member of a community yet.</p>
        )}
      </div>
    );
  }

  const tiles = [
    { href: '/record', title: 'Record', sub: 'Save a story, recording or observation', icon: '●' },
    { href: '/stories', title: 'Stories', sub: loading ? 'Opening…' : `${items.length} you can open`, icon: '❖' },
    { href: '/map', title: 'Map', sub: 'Find stories by place', icon: '◎' },
    { href: '/messages', title: 'Messages', sub: 'Talk with your community', icon: '✉' },
    { href: '/releases', title: 'Releases', sub: cas.has(userId ?? '') ? 'Review and sign public summaries' : 'Public summaries', icon: '✓' },
    { href: '/community', title: 'Community', sub: 'People, roles and the governance log', icon: '☷' },
    { href: '/legacy', title: 'Legacy', sub: 'Pass knowledge on to the right people, later', icon: '❦' },
    { href: '/notifications', title: 'Notifications', sub: 'What needs you', icon: '◔' },
  ];

  return (
    <div>
      <div className="relative overflow-hidden rounded bg-ink text-white p-6 sm:p-8 pb-14 sm:pb-24 mb-6">
        <div className="label label-dark mb-2">{org.name}</div>
        <h1 className="font-head font-extrabold text-3xl sm:text-4xl break-words">HELLO, <span className="text-gold">{first.toUpperCase()}</span></h1>
        <div className="flex flex-wrap gap-2 mt-4">
          {cas.has(userId ?? '') && <span className="chip !bg-gold !border-gold !text-ink">Cultural Authority</span>}
          {mine.has('standing:women') && <span className="chip chip-women">Women&apos;s standing confirmed</span>}
          {mine.has('standing:men') && <span className="chip chip-men">Men&apos;s standing confirmed</span>}
          {mine.has('role:recovery_keeper') && <span className="chip">Recovery Keeper</span>}
          {org.is_admin && <span className="chip">Administrator</span>}
          {!org.content_member && <span className="chip chip-warn">Administrator only: receives no content keys</span>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/landscape.jpg" alt="" className="absolute bottom-0 left-0 w-full h-auto opacity-60 pointer-events-none" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="tile">
            <span className="text-3xl text-gold-text" aria-hidden>{t.icon}</span>
            <span>
              <span className="block font-head font-extrabold tracking-wide">{t.title.toUpperCase()}</span>
              <span className="block text-mute text-sm">{t.sub}</span>
            </span>
          </Link>
        ))}
      </div>

      {!org.content_member && (
        <div className="card p-5 mt-6">
          <h2 className="font-head font-semibold mb-1">Why you see no stories</h2>
          <p className="text-mute">As an administrator you run the community space: approving members, settings and the bridge to other organisations. You are never given content keys, so you cannot open any story, even with full database access. This is the core promise of the platform.</p>
        </div>
      )}
    </div>
  );
}