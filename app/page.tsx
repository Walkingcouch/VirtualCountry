'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import { eligibleRecipients } from '@/lib/access';
import { saveItemVersion, type OpenItem } from '@/lib/data';
import ItemChips from '@/components/ItemChips';

type Filter = 'all' | 'mine' | 'restricted' | 'shared';

export default function Stories() {
  const { userId, dir, keys, org, nameOf } = useSession();
  const { items, loading, reload, failures } = useItems();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [stale, setStale] = useState<OpenItem[]>([]);
  const [busy, setBusy] = useState(false);

  // Holder tool: find my items whose access no longer matches the community (people joined, left or were confirmed)
  useEffect(() => {
    (async () => {
      if (!dir || !userId) return;
      const out: OpenItem[] = [];
      for (const it of items.filter((i) => i.row.holder_id === userId && !i.row.paused)) {
        const want = await eligibleRecipients(dir, userId, it.payload);
        const a = [...want].sort().join(), b = [...it.recipients].sort().join();
        if (a !== b) out.push(it);
      }
      setStale(out);
    })();
  }, [items, dir, userId]);

  const updateAccess = async () => {
    if (!keys || !userId || !org || !dir) return;
    setBusy(true);
    try {
      for (const it of stale) await saveItemVersion({ itemId: it.row.id, orgId: org.id, version: it.version + 1, payload: it.payload, me: keys, myId: userId, dir, paused: false });
      await reload();
    } finally { setBusy(false); }
  };

  const shown = useMemo(() => items.filter((it) => {
    const p = it.payload;
    if (filter === 'mine' && it.row.holder_id !== userId) return false;
    if (filter === 'restricted' && !(p.restrictions.gender || p.access.level === 'group' || p.access.level === 'only_me' || it.row.paused || p.restrictions.sacred)) return false;
    if (filter === 'shared' && it.row.holder_id === userId) return false;
    if (q && !(`${p.title} ${p.body}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [items, filter, q, userId]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="label mb-1">Only what your keys can open <span className="rule" /></div>
          <h1 className="font-head font-extrabold text-3xl">STORIES</h1>
        </div>
        <Link href="/record" className="btn btn-gold">● Record</Link>
      </div>

      {stale.length > 0 && (
        <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-gold">
          <p className="text-[.95rem]"><b>{stale.length} of your items need an access update</b>, because people joined, left or had their standing confirmed. Updating re-locks them for the right people.</p>
          <button className="btn btn-ink" onClick={updateAccess} disabled={busy}>{busy ? 'Re-locking…' : 'Update access'}</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {([['all', 'All'], ['mine', 'I hold'], ['shared', 'Shared with me'], ['restricted', 'Restricted']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} className={`btn !min-h-10 ${filter === v ? 'btn-ink' : 'btn-line'}`}>{l}</button>
        ))}
        <input className="input !w-auto flex-1 min-w-[200px]" placeholder="Search your stories (on this device)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>

      {loading && <p className="text-mute">Opening your stories on this device…</p>}
      {!loading && shown.length === 0 && (
        <div className="card p-6 text-center text-mute">
          {org?.content_member === false ? 'Administrator accounts hold no content keys, so no stories can be opened here.' : 'Nothing here yet.'}
        </div>
      )}
      {failures > 0 && <p className="text-sm text-danger mb-3">{failures} item(s) could not be opened on this device.</p>}

      <div className="grid md:grid-cols-2 gap-3">
        {shown.map((it) => (
          <Link key={it.row.id} href={`/stories/${it.row.id}`} className="card p-4 hover:border-gold transition block">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-head font-semibold leading-snug">{it.payload.title}</h2>
              <span className="text-xs text-mute whitespace-nowrap">{new Date(it.payload.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            </div>
            <p className="text-sm text-mute line-clamp-2 mb-3">{it.payload.restrictions.deceased ? 'Warning: mentions someone who has passed away.' : it.payload.body}</p>
            <ItemChips it={it} groups={dir?.groups ?? []} />
            <p className="text-xs text-mute mt-2">Held by {it.row.holder_id === userId ? 'you' : nameOf(it.row.holder_id)} · {it.recipients.length} key{it.recipients.length === 1 ? '' : 's'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
