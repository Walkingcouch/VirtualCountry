'use client';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { addToGroup, createGroup, removeFromGroup, type GroupKind } from '@/lib/data';
import { friendly } from '@/lib/errors';

const KINDS: Record<GroupKind, string> = { family: 'Family', school: 'School', rangers: 'Rangers', custom: 'Other' };

/** Groups decide who receives keys when a holder shares with a group. Everyone can see them; administrators change them, and every change is logged. */
export default function GroupsAdmin({ onChanged }: { onChanged: () => Promise<void> }) {
  const { org, dir, refresh, nameOf } = useSession();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('family');
  const [add, setAdd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (!org || !dir) return null;
  const isAdmin = org.is_admin;
  const active = dir.members.filter((m) => m.status === 'active');
  const short = (id: string) => nameOf(id).split(' (')[0];

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key); setMsg(''); setErr('');
    try { await fn(); await refresh(); await onChanged(); setMsg(ok); } catch (e) { setErr(friendly(e)); } finally { setBusy(''); }
  };

  return (
    <section aria-labelledby="groups-h">
      <h2 id="groups-h" className="font-head font-semibold text-lg mb-1">Groups</h2>
      <p className="text-sm text-mute mb-3">A holder can share an item with a group, such as a family. Only people in the group receive a key. Changes here apply the next time a holder updates access, and every change is in the governance log.</p>
      {msg && <p className="text-sm text-ok mb-2" role="status">{msg}</p>}
      {err && <p className="text-sm text-danger mb-2" role="alert">{err}</p>}
      <div className="card divide-y divide-line">
        {dir.groups.length === 0 && <p className="p-4 text-sm text-mute">No groups yet.</p>}
        {dir.groups.map((g) => {
          const candidates = active.filter((m) => !g.members.includes(m.user_id));
          return (
            <div key={g.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-semibold break-words">{g.name}</span>
                <span className="chip">{KINDS[g.kind as GroupKind] ?? g.kind}</span>
                <span className="text-sm text-mute">{g.members.length} {g.members.length === 1 ? 'person' : 'people'}</span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {g.members.map((u) => (
                  <li key={u} className="chip !py-1">
                    {short(u)}
                    {isAdmin && (
                      <button className="ml-1 underline" disabled={busy === `rm-${g.id}-${u}`} aria-label={`Take ${short(u)} out of ${g.name}`}
                        onClick={() => { if (confirm(`Take ${short(u)} out of ${g.name}?\n\nThey keep access to items already shared with the group until each holder updates access.`)) run(`rm-${g.id}-${u}`, () => removeFromGroup(g.id, u), `${short(u)} was taken out of ${g.name}.`); }}>
                        remove
                      </button>
                    )}
                  </li>
                ))}
                {g.members.length === 0 && <li className="text-sm text-mute">Nobody yet.</li>}
              </ul>
              {isAdmin && candidates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <select className="select !w-auto !min-h-10" aria-label={`Person to add to ${g.name}`} value={add[g.id] ?? ''} onChange={(e) => setAdd({ ...add, [g.id]: e.target.value })}>
                    <option value="">Add a person…</option>
                    {candidates.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name.split(' (')[0]}</option>)}
                  </select>
                  <button className="btn btn-line !min-h-10" disabled={!add[g.id] || busy === `add-${g.id}`}
                    onClick={() => run(`add-${g.id}`, async () => { await addToGroup(g.id, add[g.id]); setAdd({ ...add, [g.id]: '' }); }, `${short(add[g.id])} was added to ${g.name}.`)}>
                    Add
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <form className="flex flex-wrap gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); run('new', async () => { await createGroup(org.id, name, kind); setName(''); }, 'Group created.'); }}>
          <input className="input !w-auto flex-1 min-w-[180px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="New group name" aria-label="New group name" maxLength={60} />
          <select className="select !w-auto" value={kind} onChange={(e) => setKind(e.target.value as GroupKind)} aria-label="Kind of group">
            {(Object.keys(KINDS) as GroupKind[]).map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}
          </select>
          <button className="btn btn-ink" disabled={name.trim().length < 2 || busy === 'new'}>Create group</button>
        </form>
      )}
    </section>
  );
}
