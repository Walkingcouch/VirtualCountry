'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import { approveRelease, closeWish, describeWhen, loadLegacy, receive, withdrawApproval, type LegacyView } from '@/lib/legacy';

const short = (n: string) => n.split(' (')[0];

export default function Legacy() {
  const { keys, userId, org, dir, standing, nameOf } = useSession();
  const { items, reload } = useItems();
  const [views, setViews] = useState<LegacyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!keys || !userId || !org) return;
    try { setViews(await loadLegacy(keys, userId, org.id)); } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, [keys, userId, org]);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg('');
    try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };

  const active = views.filter((v) => v.row.status === 'active');
  const mine = views.filter((v) => v.myRole === 'holder');
  const keeping = active.filter((v) => v.myRole === 'keeper');
  const forMe = active.filter((v) => v.approvals.some((a) => a.recipient_id === userId && !a.withdrawn_at));
  const opened = new Set(items.map((i) => i.row.id));

  /** People a keeper may release to: active members, not the holder or keeper, not on the never list, and with the right standing. */
  const eligible = (v: LegacyView) => (dir?.members ?? []).filter((m) =>
    m.status === 'active' && m.content_member && m.enc_pk && m.user_id !== userId && m.user_id !== v.row.holder_id
    && !v.wish?.never.some((n) => n.userId === m.user_id)
    && (!v.wish?.gender || standing.get(m.user_id)?.has(v.wish.gender === 'women' ? 'standing:women' : 'standing:men')));

  return (
    <div className="max-w-4xl">
      <div className="label mb-1">Pass knowledge on, on your terms <span className="rule" /></div>
      <h1 className="font-head font-extrabold text-3xl mb-2">LEGACY</h1>
      <p className="text-mute mb-5">Choose who should receive your knowledge in the future, even if they are children now or not yet born, and who never should. Nobody can open it until enough of your Legacy Keepers agree your wishes are met. If nobody ever meets them, it rests with you.</p>

      <ol className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          ['You decide', 'Open one of your items and tap "Pass this on, later". Name who, who never, when, and your keepers.'],
          ['Keepers hold parts', 'Each keeper holds one part of the key. A part opens nothing on its own, and the platform never holds the key.'],
          ['When the time comes', 'Enough keepers agree on their own devices. The person receives the key, and nobody else does.'],
        ].map(([t, d], i) => (
          <li key={t} className="card p-4">
            <div className="font-head font-extrabold text-gold-text text-2xl">{i + 1}</div>
            <div className="font-head font-semibold">{t}</div>
            <p className="text-sm text-mute">{d}</p>
          </li>
        ))}
      </ol>

      {msg && <p className="card p-4 mb-5 text-sm border-gold" role="status">{msg}</p>}
      {loading && <p className="text-mute">Opening…</p>}

      {forMe.length > 0 && (
        <section className="mb-8">
          <h2 className="font-head font-semibold text-lg mb-3">Passed on to you</h2>
          <div className="space-y-3">
            {forMe.map((v) => {
              const agreed = v.approvals.filter((a) => a.recipient_id === userId && !a.withdrawn_at).length;
              const ready = agreed >= v.row.threshold;
              const have = opened.has(v.row.item_id);
              return (
                <div key={v.row.id} className="card p-5">
                  <div className="font-semibold">From {short(nameOf(v.row.holder_id))}</div>
                  <p className="text-sm text-mute">{agreed} of {v.row.threshold} keepers needed have agreed.</p>
                  {have ? (
                    <Link className="btn btn-gold mt-3" href={`/stories/${v.row.item_id}`}>Open it</Link>
                  ) : ready ? (
                    <button className="btn btn-gold mt-3" disabled={!!busy} onClick={() => run(v.row.id, async () => { await receive(v, keys!, userId!); await reload(); }, 'Received. It has been unlocked on this device and is now in your Stories.')}>
                      {busy === v.row.id ? 'Joining the parts…' : 'Receive it'}
                    </button>
                  ) : <p className="text-sm mt-2">Waiting for {v.row.threshold - agreed} more keeper(s).</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="font-head font-semibold text-lg mb-1">You are a Legacy Keeper for</h2>
        <p className="text-sm text-mute mb-3">Only act when you are sure the holder&apos;s wishes are met. Your decision is recorded in the governance log.</p>
        {!loading && keeping.length === 0 && <p className="text-sm text-mute">Nobody has asked you to be a keeper.</p>}
        <div className="space-y-4">
          {keeping.map((v) => {
            const w = v.wish;
            const live = v.approvals.filter((a) => !a.withdrawn_at);
            const people = eligible(v);
            const named = w?.recipients.filter((r) => r.kind === 'member').map((r) => r.kind === 'member' ? r.userId : '') ?? [];
            const sorted = [...people].sort((a, b) => Number(named.includes(b.user_id)) - Number(named.includes(a.user_id)));
            const pick = choice[v.row.id] ?? '';
            return (
              <div key={v.row.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-head font-extrabold text-lg">{w?.itemTitle ?? 'An item'}</h3>
                  <span className="text-sm text-mute">Held by {short(nameOf(v.row.holder_id))} · {v.row.threshold} of {w?.keeperIds.length ?? '?'} keepers must agree</span>
                </div>
                {w ? (
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="bg-sand rounded p-3">
                      <div className="label mb-1">To</div>
                      <ul className="space-y-1">{w.recipients.map((r, i) => <li key={i}>{r.kind === 'member' ? `${short(r.name)}${r.note ? ` (${r.note})` : ''}` : `🌱 ${r.description}`}</li>)}</ul>
                    </div>
                    <div className="bg-[#FBEDE3] rounded p-3">
                      <div className="label mb-1">Never to</div>
                      {w.never.length ? <ul className="space-y-1">{w.never.map((n, i) => <li key={i}>✕ {short(n.name)}</li>)}</ul> : <p className="text-mute">Nobody named.</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <b>When:</b> {describeWhen(w)}. {w.restsWithMe ? 'If nobody meets these wishes, it rests with the holder.' : 'If nobody meets these wishes, keepers may choose a suitable person.'}
                      {w.gender && <> Only for people with confirmed {w.gender === 'women' ? "women's" : "men's"} standing.</>}
                    </div>
                    {w.message && <details className="sm:col-span-2"><summary className="cursor-pointer underline">Message from {short(w.holderName)}</summary><p className="mt-2 whitespace-pre-wrap">{w.message}</p></details>}
                  </div>
                ) : <p className="text-sm text-mute">The wishes could not be opened on this device.</p>}

                {live.length > 0 && (
                  <div className="text-sm">
                    <div className="font-semibold">Agreed so far</div>
                    <ul>{live.map((a) => (
                      <li key={a.keeper_id + a.recipient_id} className="flex flex-wrap items-center gap-2">
                        {a.keeper_id === userId ? 'You' : short(nameOf(a.keeper_id))} → {short(nameOf(a.recipient_id))}
                        {a.keeper_id === userId && <button className="underline text-mute" disabled={!!busy} onClick={() => run(`w-${v.row.id}-${a.recipient_id}`, () => withdrawApproval(v.row.id, userId!, a.recipient_id), 'Your agreement was withdrawn.')}>withdraw</button>}
                      </li>
                    ))}</ul>
                  </div>
                )}

                <div className="border-t border-line pt-3 space-y-2">
                  <label className="text-sm font-semibold block">Pass it on to</label>
                  <select className="select" value={pick} onChange={(e) => setChoice({ ...choice, [v.row.id]: e.target.value })} aria-label="Person to pass it on to">
                    <option value="">Choose a person</option>
                    {sorted.map((m) => <option key={m.user_id} value={m.user_id}>{short(m.display_name)}{named.includes(m.user_id) ? ' (named by the holder)' : ''}</option>)}
                  </select>
                  {pick && !named.includes(pick) && <p className="text-xs text-mute">Not named by the holder. Only choose them if they are who the holder described (for example a great-grandchild), and the holder allowed it.</p>}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={!!confirmed[v.row.id]} onChange={(e) => setConfirmed({ ...confirmed, [v.row.id]: e.target.checked })} />
                    <span>I am satisfied the holder&apos;s wishes are met{w ? `: ${describeWhen(w).toLowerCase()}` : ''}.</span>
                  </label>
                  <button className="btn btn-ink" disabled={!pick || !confirmed[v.row.id] || !!busy || live.some((a) => a.keeper_id === userId && a.recipient_id === pick)}
                    onClick={() => run(v.row.id, () => approveRelease(v, pick, dir!, keys!, userId!), `You agreed. ${short(nameOf(pick))} receives it once ${v.row.threshold} keepers agree.`)}>
                    {busy === v.row.id ? 'Sealing your part…' : 'Agree and pass on my part'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-head font-semibold text-lg mb-1">Your legacy wishes</h2>
        <p className="text-sm text-mute mb-3">To make one, open an item you hold and tap &ldquo;Pass this on, later&rdquo;.</p>
        {!loading && mine.length === 0 && <p className="text-sm text-mute">You have not made any yet.</p>}
        <div className="space-y-3">
          {mine.map((v) => (
            <div key={v.row.id} className={`card p-4 ${v.row.status !== 'active' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/stories/${v.row.item_id}`} className="font-semibold underline">{v.wish?.itemTitle ?? 'Item'}</Link>
                <span className="chip">{v.row.status === 'active' ? 'Active' : v.row.status}</span>
              </div>
              {v.wish && (
                <p className="text-sm mt-1">
                  To {v.wish.recipients.map((r) => (r.kind === 'member' ? short(r.name) : r.description)).join('; ')}. {describeWhen(v.wish)}.
                  {v.wish.never.length ? ` Never ${v.wish.never.map((n) => short(n.name)).join(', ')}.` : ''}
                  {' '}Keepers: {v.wish.keeperIds.map((k) => short(nameOf(k))).join(', ')} ({v.row.threshold} must agree).
                </p>
              )}
              {v.approvals.filter((a) => !a.withdrawn_at).length > 0 && <p className="text-sm text-mute mt-1">Agreed: {v.approvals.filter((a) => !a.withdrawn_at).map((a) => `${short(nameOf(a.keeper_id))} → ${short(nameOf(a.recipient_id))}`).join('; ')}</p>}
              {v.row.status === 'active' && (
                <button className="btn btn-danger !min-h-9 mt-3" disabled={!!busy} onClick={() => { if (confirm('Cancel this legacy wish? Your keepers will no longer be able to pass it on.')) run(`c-${v.row.id}`, () => closeWish(v.row.id, 'revoked'), 'Legacy wish cancelled.'); }}>Cancel this wish</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
