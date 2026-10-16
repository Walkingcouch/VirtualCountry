'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { loadReleases, signRelease, verifyRelease, type Release } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { TK_LABELS } from '@/lib/model';
import DemoMap from '@/components/DemoMap';

type Row = Release & { ok?: boolean };

export default function Releases() {
  const { org, keys, userId, cas, dir, nameOf } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const isCa = cas.has(userId ?? '');

  const load = useCallback(async () => {
    if (!org) return;
    const r = await loadReleases(org.id);
    const pk = new Map((dir?.members ?? []).map((m) => [m.user_id, m.sign_pk]));
    setRows(await Promise.all(r.map(async (x) => ({ ...x, ok: x.status === 'published' ? await verifyRelease(x, pk.get(x.signer_id ?? '')) : undefined }))));
  }, [org, dir]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  const act = async (r: Release, what: 'sign' | 'reject' | 'withdraw') => {
    if (!keys) return;
    setBusy(r.id + what); setMsg('');
    try {
      if (what === 'sign') await signRelease(r, keys);
      if (what === 'reject') { const { error } = await supabase().rpc('reject_release', { p_release: r.id }); if (error) throw error; }
      if (what === 'withdraw') { const { error } = await supabase().rpc('withdraw_release', { p_release: r.id }); if (error) throw error; }
      setMsg(what === 'sign' ? 'Signed and published. It now appears on the public page.' : what === 'reject' ? 'Returned without publishing.' : 'Withdrawn from public view.');
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };

  const section = (title: string, list: Row[], empty: string) => (
    <section className="mb-8">
      <h2 className="font-head font-semibold text-lg mb-3">{title}</h2>
      {list.length === 0 && <p className="text-mute text-sm">{empty}</p>}
      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className="card p-5 grid md:grid-cols-[1.5fr_1fr] gap-4">
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="chip">{r.status}</span>
                {r.ok === true && <span className="chip chip-ok">✓ Signature checked</span>}
                {r.ok === false && <span className="chip chip-warn">Signature failed</span>}
                {r.labels.map((l) => <span key={l} className="chip">{TK_LABELS[l] ?? l}</span>)}
              </div>
              <h3 className="font-head font-extrabold text-xl mb-1">{r.title}</h3>
              <p className="mb-2">{r.summary}</p>
              <p className="text-sm text-mute">Drafted by {r.created_by === userId ? 'you' : nameOf(r.created_by)}{r.signer_id ? ` · signed by ${r.signer_id === userId ? 'you' : nameOf(r.signer_id)}` : ''} · {r.place_label}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {r.status === 'pending' && isCa && <button className="btn btn-gold" disabled={!!busy} onClick={() => act(r, 'sign')}>{busy === r.id + 'sign' ? 'Signing…' : 'Approve and sign'}</button>}
                {r.status === 'pending' && isCa && <button className="btn btn-line" disabled={!!busy} onClick={() => act(r, 'reject')}>Send back</button>}
                {r.status === 'pending' && !isCa && <span className="text-sm text-mute">Waiting for a Cultural Authority to sign.</span>}
                {r.status === 'published' && (r.created_by === userId || isCa) && <button className="btn btn-danger" disabled={!!busy} onClick={() => act(r, 'withdraw')}>Withdraw</button>}
                {r.status === 'published' && <Link className="btn btn-line" href="/public">View public page</Link>}
              </div>
            </div>
            {r.blur_x !== null && r.blur_y !== null && <DemoMap blurCell={{ bx: r.blur_x, by: r.blur_y, size: 100 }} height={220} />}
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div>
      <div className="label mb-1">Nothing is public without cultural sign-off <span className="rule" /></div>
      <h1 className="font-head font-extrabold text-3xl mb-2">RELEASES</h1>
      <p className="text-mute mb-6 max-w-3xl">Public summaries are written by the holder and signed by a Cultural Authority of this community. Sacred, paused, women&apos;s and men&apos;s items can never be released. {isCa ? 'You are a Cultural Authority, so you can sign.' : ''}</p>
      {msg && <p className="card p-3 mb-4 text-sm">{msg}</p>}
      {section('Waiting for sign-off', rows.filter((r) => r.status === 'pending'), 'Nothing waiting.')}
      {section('Published', rows.filter((r) => r.status === 'published'), 'Nothing published yet.')}
      {section('Withdrawn or sent back', rows.filter((r) => r.status === 'withdrawn' || r.status === 'rejected'), 'None.')}
    </div>
  );
}
