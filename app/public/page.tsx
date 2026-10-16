'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadPublicReleases, verifyRelease, type Release } from '@/lib/data';
import { TK_LABELS } from '@/lib/model';
import Logo from '@/components/Logo';
import DemoMap from '@/components/DemoMap';

type Row = Release & { signer_name?: string; signer_pk?: string; ok?: boolean };

export default function PublicReleases() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    loadPublicReleases()
      .then(async (r) => setRows(await Promise.all(r.map(async (x) => ({ ...x, ok: await verifyRelease(x, x.signer_pk) })))))
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <main className="min-h-screen bg-paper">
      <header className="bg-ink">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/"><Logo className="h-12" /></Link>
          <Link href="/login" className="btn btn-gold">Sign in →</Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="label mb-2">Released with cultural authority <span className="rule" /></div>
        <h1 className="font-head font-extrabold text-4xl mb-3">PUBLIC <span className="text-gold-text">RELEASES</span></h1>
        <p className="text-mute max-w-2xl mb-8">Each summary below was approved and digitally signed by a Cultural Authority of the community. Your browser checks every signature. Locations are generalised. The detailed knowledge stays with the community.</p>
        {err && <p className="text-danger">{err}</p>}
        {!rows && !err && <p className="text-mute">Loading…</p>}
        {rows?.length === 0 && <p className="text-mute">Nothing has been released publicly yet.</p>}
        <div className="space-y-6">
          {rows?.map((r) => (
            <article key={r.id} className="card overflow-hidden grid md:grid-cols-[1.4fr_1fr]">
              <div className="p-6">
                <div className="flex flex-wrap gap-2 mb-3">
                  {r.ok ? <span className="chip chip-ok">✓ Signature checked</span> : <span className="chip chip-warn">Signature could not be checked</span>}
                  {r.labels.map((l) => <span key={l} className="chip">{TK_LABELS[l] ?? l}</span>)}
                </div>
                <h2 className="font-head font-extrabold text-2xl mb-2">{r.title}</h2>
                <p className="mb-4">{r.summary}</p>
                <p className="text-sm text-mute">Location: {r.place_label}</p>
                <p className="text-sm text-mute">Approved by {r.signer_name?.replace(' (Elder, demo)', '') ?? 'a Cultural Authority'} · {r.published_at ? new Date(r.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
                <p className="text-xs text-mute mt-4">Reuse needs permission from the community, as shown by the labels.</p>
              </div>
              {r.blur_x !== null && r.blur_y !== null && <div className="bg-deep p-3"><DemoMap blurCell={{ bx: r.blur_x, by: r.blur_y, size: 100 }} height={320} /></div>}
            </article>
          ))}
        </div>
        <p className="text-sm text-mute mt-10">Questions about these summaries, or about Virtual Country: <a className="underline" href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a></p>
      </div>
    </main>
  );
}
