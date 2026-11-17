'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { allOrgs, askToJoin, createOrg, leaveOrg } from '@/lib/data';
import { friendly } from '@/lib/errors';

const KIND: Record<string, string> = { community: 'Community', partner: 'Partner organisation', school: 'School' };

export default function Organisations() {
  const { orgs, org, userId, setOrgId, refresh } = useSession();
  const router = useRouter();
  const [all, setAll] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'community' | 'partner'>('community');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { allOrgs().then(setAll).catch((e) => setErr(friendly(e))); }, []);
  const mine = new Map(orgs.map((o) => [o.id, o]));
  const others = all.filter((o) => !mine.has(o.id) || mine.get(o.id)!.status === 'removed');

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setErr(''); setMsg('');
    try { await fn(); setMsg(ok); await refresh(); setAll(await allOrgs()); } catch (e) { setErr(friendly(e)); } finally { setBusy(''); }
  };

  const start = () => run('new', async () => {
    const id = await createOrg(name, kind);
    setName('');
    await refresh();
    setOrgId(id);
    router.push('/community');
  }, 'Organisation started. You are its first administrator.');

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="label mb-1">Where you belong <span className="rule" /></div>
        <h1 className="font-head font-extrabold text-3xl">ORGANISATIONS</h1>
        <p className="text-mute mt-1">You can belong to more than one organisation. Each keeps its own members, stories and chats. Organisations only talk to each other through a bridge run by their administrators.</p>
      </div>
      {msg && <p className="card p-3 text-sm border-gold" role="status">{msg}</p>}
      {err && <p className="card p-3 text-sm text-danger" role="alert">{err}</p>}

      <section>
        <h2 className="font-head font-semibold text-lg mb-2">Yours</h2>
        <div className="card divide-y divide-line">
          {orgs.filter((o) => o.status !== 'removed').length === 0 && <p className="p-4 text-sm text-mute">You are not in any organisation yet.</p>}
          {orgs.filter((o) => o.status !== 'removed').map((o) => (
            <div key={o.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold break-words">{o.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="chip">{KIND[o.kind] ?? o.kind}</span>
                  {o.status === 'pending' && <span className="chip chip-warn">Waiting for an administrator to approve you</span>}
                  {o.is_admin && <span className="chip !bg-gold !border-gold">Administrator</span>}
                  {org?.id === o.id && <span className="chip chip-ok">Open now</span>}
                </div>
              </div>
              {o.status === 'active' && org?.id !== o.id && (
                <button className="btn btn-ink !min-h-10" onClick={() => { setOrgId(o.id); router.push('/'); }}>Switch to this</button>
              )}
              {!o.is_admin && <button className="btn btn-line !min-h-10" disabled={busy === `leave-${o.id}`}
                onClick={() => {
                  if (!userId) return;
                  const pending = o.status === 'pending';
                  if (!confirm(pending ? `Withdraw your request to join ${o.name}?` : `Leave ${o.name}?\n\nYou will stop seeing its stories and chats straight away. Download anything you want to keep first (Me, then Download my data). You can ask to join again later.`)) return;
                  run(`leave-${o.id}`, () => leaveOrg(o.id, userId), pending ? 'Request withdrawn.' : `You have left ${o.name}.`);
                }}>
                {o.status === 'pending' ? 'Withdraw request' : 'Leave'}
              </button>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-head font-semibold text-lg mb-2">Ask to join another</h2>
        <div className="card divide-y divide-line">
          {others.length === 0 && <p className="p-4 text-sm text-mute">There are no other organisations to join.</p>}
          {others.map((o) => (
            <div key={o.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]"><div className="font-semibold break-words">{o.name}</div><div className="text-xs text-mute">{KIND[o.kind] ?? o.kind}</div></div>
              <button className="btn btn-line !min-h-10" disabled={!!busy} onClick={() => run(o.id, () => askToJoin(o.id, userId!), `Asked to join ${o.name}. Their administrator will approve you.`)}>
                {busy === o.id ? 'Asking…' : 'Ask to join'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-head font-semibold text-lg mb-2">Start a new organisation</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-mute">You become its first administrator. For a community, you are also its founding Cultural Authority, so you can confirm standings and appoint a second Cultural Authority. In real use this is agreed with the community in person first.</p>
          <label className="block text-sm font-semibold" htmlFor="org-name">Name</label>
          <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Test Ranger Group" maxLength={80} />
          <fieldset className="flex flex-wrap gap-2">
            <legend className="text-sm font-semibold mb-1">Type</legend>
            {(['community', 'partner'] as const).map((k) => (
              <label key={k} className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer text-sm ${kind === k ? 'border-ink bg-sand' : 'border-line'}`}>
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} /> {KIND[k]}
              </label>
            ))}
          </fieldset>
          <button className="btn btn-gold w-full sm:w-auto" disabled={name.trim().length < 3 || !!busy} onClick={start}>{busy === 'new' ? 'Starting…' : 'Start organisation'}</button>
          <p className="text-xs text-mute">Demo limit: up to 3 organisations per person. Names must be unique.</p>
        </div>
      </section>
    </div>
  );
}
