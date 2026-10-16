'use client';
import Link from 'next/link';
import { useNotes } from '@/lib/notes-context';
import type { Note } from '@/lib/notifications';

const GROUP: Record<Note['kind'], string> = {
  security: 'Needs your attention', legacy: 'Legacy', ca: 'Cultural Authority', release: 'Public summaries', member: 'People', message: 'Messages',
};
const ORDER: Note['kind'][] = ['security', 'legacy', 'ca', 'release', 'member', 'message'];

export default function Notifications() {
  const { notes, reload } = useNotes();
  return (
    <div className="max-w-3xl">
      <div className="label mb-1">What&apos;s new for you <span className="rule" /></div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <h1 className="font-head font-extrabold text-3xl">NOTIFICATIONS</h1>
        <button className="btn btn-line !min-h-9" onClick={() => reload()}>Check again</button>
      </div>
      <p className="text-mute mb-6 text-sm">Worked out on this device from what you can already see. Nothing about your content leaves your device to make these. Email and phone alerts are planned; they will only ever say &ldquo;something is waiting for you&rdquo;, never what it is.</p>

      {notes.length === 0 && <div className="card p-6 text-center text-mute">You&apos;re all caught up.</div>}

      <div className="space-y-6">
        {ORDER.map((k) => {
          const list = notes.filter((n) => n.kind === k);
          if (!list.length) return null;
          return (
            <section key={k}>
              <h2 className="font-head font-semibold mb-2">{GROUP[k]} <span className="text-mute font-normal">({list.length})</span></h2>
              <div className="card divide-y divide-line">
                {list.map((n) => (
                  <Link key={n.id} href={n.href} className="flex items-start justify-between gap-3 p-4 hover:bg-sand">
                    <span className="flex items-start gap-2">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${k === 'security' ? 'bg-danger' : 'bg-gold'}`} aria-hidden />
                      <span>{n.text}</span>
                    </span>
                    {n.at && <span className="text-xs text-mute shrink-0">{new Date(n.at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
