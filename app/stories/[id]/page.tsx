'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import { blurPoint, draftRelease, openMedia, saveItemVersion } from '@/lib/data';
import { TK_LABELS, USE_LABELS, type UseKey } from '@/lib/model';
import ItemChips from '@/components/ItemChips';
import DemoMap from '@/components/DemoMap';
import AccessPicker, { accessFromPayload, applyAccess, type AccessValue } from '@/components/AccessPicker';
import LegacyForm from '@/components/LegacyForm';
import { describeWhen, loadLegacy, refreshWish, type LegacyView } from '@/lib/legacy';
import { describeAccess } from '@/lib/access';

export default function Story() {
  const { id } = useParams<{ id: string }>();
  const { userId, keys, org, dir, nameOf } = useSession();
  const { items, loading, reload } = useItems();
  const it = items.find((x) => x.row.id === id);
  const [accepted, setAccepted] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [rel, setRel] = useState<{ title: string; summary: string } | null>(null);
  const [editAccess, setEditAccess] = useState<AccessValue | null>(null);
  const [legacyForm, setLegacyForm] = useState(false);
  const [wishes, setWishes] = useState<LegacyView[]>([]);

  useEffect(() => { setAccepted(false); setEditAccess(null); setLegacyForm(false); }, [id]);

  const loadWishes = useCallback(async () => {
    if (!keys || !userId || !org) return;
    try { setWishes((await loadLegacy(keys, userId, org.id)).filter((w) => w.row.item_id === id && w.myRole === 'holder' && w.row.status === 'active')); } catch { setWishes([]); }
  }, [keys, userId, org, id]);
  useEffect(() => { loadWishes(); }, [loadWishes]);
  useEffect(() => { if (legacyForm) document.getElementById('legacy-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [legacyForm]);

  /** A new version has a new key, so legacy wishes are re-made for it on this device. */
  const refreshLegacy = async (version: number) => {
    if (!keys || !userId || !dir || !wishes.length) return 0;
    for (const w of wishes) await refreshWish(w, version, keys, userId, dir);
    await loadWishes();
    return wishes.length;
  };

  if (loading) return <p className="text-mute">Opening…</p>;
  if (!it) {
    return (
      <div className="card p-6 max-w-xl">
        <h1 className="font-head font-semibold mb-2">This item cannot be opened</h1>
        <p className="text-mute">Either it does not exist, or your device has not been given a key for it. Nobody can open an item without a key, including administrators.</p>
        <Link className="btn btn-line mt-4" href="/stories">Back to stories</Link>
      </div>
    );
  }

  const p = it.payload;
  const holder = it.row.holder_id === userId;
  const needsWarning = p.restrictions.deceased && !accepted;
  const blur = p.place ? blurPoint(p.place.x, p.place.y, 10) : null;

  const newVersion = async (paused: boolean) => {
    if (!keys || !userId || !org || !dir) return;
    setBusy(paused ? 'pause' : 'unpause'); setMsg('');
    try {
      const r = await saveItemVersion({ itemId: it.row.id, orgId: org.id, version: it.version + 1, payload: p, me: keys, myId: userId, dir, paused });
      const n = await refreshLegacy(it.version + 1);
      await reload();
      setMsg((paused ? 'Paused. Re-locked under a new key that only you hold. Everyone else has lost access.' : `Pause lifted. Re-locked for ${r.length} people.`) + (n ? ' Your legacy wishes were renewed for the new key.' : ''));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };

  const saveAccess = async () => {
    if (!keys || !userId || !org || !dir || !editAccess) return;
    if (editAccess.level === 'group' && !editAccess.groupId) return setMsg('Choose a group.');
    setBusy('access'); setMsg('');
    try {
      const before = new Set(it.recipients);
      const r = await saveItemVersion({ itemId: it.row.id, orgId: org.id, version: it.version + 1, payload: applyAccess(p, editAccess), me: keys, myId: userId, dir, paused: it.row.paused });
      const added = r.filter((x) => !before.has(x)).map((x) => nameOf(x).split(' (')[0]);
      const removed = it.recipients.filter((x) => !r.includes(x)).map((x) => nameOf(x).split(' (')[0]);
      const n = await refreshLegacy(it.version + 1);
      await reload();
      setEditAccess(null);
      setMsg(`Saved and locked again with a new key. ${r.length} ${r.length === 1 ? 'person' : 'people'} can open it.${added.length ? ` Added: ${added.join(', ')}.` : ''}${removed.length ? ` Removed: ${removed.join(', ')}.` : ''}${n ? ' Legacy wishes renewed.' : ''} The change is in the governance log.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };

  const submitRelease = async () => {
    if (!rel || !org || !userId) return;
    setBusy('release'); setMsg('');
    try {
      await draftRelease({ orgId: org.id, itemId: it.row.id, title: rel.title, summary: rel.summary, placeLabel: p.place ? `${p.place.label.replace(/^Near /, '').replace(' (demo)', '')} area (location generalised)` : 'Location not shared', bx: blur?.bx ?? null, by: blur?.by ?? null, labels: p.labels.filter((l) => !['tk-women', 'tk-men'].includes(l)), myId: userId });
      setRel(null);
      setMsg('Sent for Cultural Authority sign-off. It will appear publicly only after it is signed.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(''); }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ item: it.row, payload: p, recipients: it.recipients.map((r) => nameOf(r)) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${p.title.replace(/[^a-z0-9]+/gi, '-')}.json`; a.click();
  };

  const canRelease = holder && !it.row.paused && !p.restrictions.sacred && !p.restrictions.gender && p.consent.uses.public === 'yes';

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
      <article>
        <Link href="/stories" className="text-sm text-mute hover:text-text">← Stories</Link>
        <div className="label mt-3 mb-1">{p.kind}</div>
        <h1 className="font-head font-extrabold text-3xl mb-3 break-words">{p.title}</h1>
        {msg && <p className="card p-4 text-sm mb-3 border-gold" role="status">{msg}</p>}
        <ItemChips it={it} groups={dir?.groups ?? []} />

        {needsWarning ? (
          <div className="card p-6 mt-5 border-[#F0D9A6] bg-[#FFF8EA]">
            <h2 className="font-head font-semibold mb-2">Before you open this</h2>
            <p>This item shows or names a person who has passed away. Please follow your community&apos;s protocols.</p>
            <button className="btn btn-ink mt-4" onClick={() => setAccepted(true)}>I understand, open it</button>
          </div>
        ) : (
          <div className="card p-6 mt-5">
            {p.restrictions.season && <p className="chip chip-warn mb-3">Restricted season: {p.restrictions.season}. Please respect it.</p>}
            <div className="whitespace-pre-wrap text-[1.05rem] leading-relaxed">{p.body || <span className="text-mute">No text.</span>}</div>
            {p.media.length > 0 && (
              <div className="mt-5 space-y-3">
                {p.media.map((m) => (
                  <div key={m.id}>
                    {!media[m.id] ? (
                      <button className="btn btn-line" onClick={async () => setMedia({ ...media, [m.id]: await openMedia(m) })}>Unlock {m.name}</button>
                    ) : m.mime.startsWith('audio') ? <audio controls src={media[m.id]} className="w-full" />
                      : m.mime.startsWith('image') ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={media[m.id]} alt={m.name} className="max-w-full rounded" />
                      : m.mime.startsWith('video') ? <video controls src={media[m.id]} className="w-full" />
                      : <a className="underline" href={media[m.id]} download={m.name}>Download {m.name}</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {p.place && !needsWarning && (
          <div className="mt-5">
            <DemoMap pins={[{ id: it.row.id, x: p.place.x, y: p.place.y, label: p.title }]} height={340} />
            <p className="text-sm text-mute mt-1">{p.place.label}</p>
          </div>
        )}

        <div className="card p-5 mt-5">
          <button className="flex w-full items-center justify-between" onClick={() => setShowServer(!showServer)}>
            <span className="font-head font-semibold">What the server sees</span><span>{showServer ? '−' : '+'}</span>
          </button>
          {showServer && (
            <div className="mt-3 text-sm space-y-2">
              <p className="text-mute">This is everything the database holds for this item. It cannot read the story, the place, the consent or the restrictions.</p>
              <pre className="bg-ink text-[#9FD9DE] p-3 rounded text-xs whitespace-pre-wrap break-all">{JSON.stringify({ id: it.row.id, holder_id: it.row.holder_id, version: it.version, paused: it.row.paused, sacred: it.row.sacred, recipients: it.recipients.length + ' sealed keys', ciphertext: it.ciphertextPreview + '…' }, null, 2)}</pre>
            </div>
          )}
        </div>
        {legacyForm && (
          <div className="mt-5" id="legacy-form">
            <LegacyForm it={it} onCancel={() => setLegacyForm(false)} onDone={(m) => { setLegacyForm(false); setMsg(m); loadWishes(); }} />
          </div>
        )}
      </article>

      <aside className="space-y-4 lg:pt-10">
        <div className="card p-5">
          <h2 className="font-head font-semibold mb-2">Who can open this</h2>
          <ul className="space-y-1">
            {it.recipients.map((r) => <li key={r} className="flex items-center gap-2"><span className="text-ok">●</span>{r === userId ? 'You' : nameOf(r)}{r === it.row.holder_id && <span className="chip !text-[.65rem]">holder</span>}</li>)}
          </ul>
          <p className="text-xs text-mute mt-3">{describeAccess(p, dir?.groups ?? [])}. Each person holds their own sealed key. Administrators and the platform hold none.</p>
          {holder && !editAccess && <button className="btn btn-line w-full mt-3" onClick={() => setEditAccess(accessFromPayload(p))}>Change who can open this</button>}
        </div>

        {holder && editAccess && (
          <div className="card p-5 space-y-3 border-gold">
            <h2 className="font-head font-semibold">Change who can open this</h2>
            <p className="text-xs text-mute">Saving locks it again with a new key. New people receive keys. Anyone removed loses access straight away.</p>
            <AccessPicker value={editAccess} onChange={setEditAccess} />
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={saveAccess} disabled={busy === 'access'}>{busy === 'access' ? 'Locking again…' : 'Save'}</button>
              <button className="btn btn-line" onClick={() => setEditAccess(null)}>Cancel</button>
            </div>
          </div>
        )}

        {holder && (
          <div className="card p-5">
            <h2 className="font-head font-semibold mb-1">Legacy</h2>
            {wishes.length === 0 ? (
              <p className="text-sm text-mute mb-3">Pass this on later, for example to children when they are grown, or to great-grandchildren not yet born. You choose who, who never, and when.</p>
            ) : (
              <ul className="space-y-2 mb-3">
                {wishes.map((w) => (
                  <li key={w.row.id} className="text-sm bg-sand rounded p-3">
                    <div className="font-semibold">{w.wish ? w.wish.recipients.map((r) => (r.kind === 'member' ? r.name.split(' (')[0] : r.description)).join('; ') : 'Legacy wish'}</div>
                    {w.wish && <div className="text-mute">{describeWhen(w.wish)}{w.wish.never.length ? ` · never ${w.wish.never.map((n) => n.name.split(' (')[0]).join(', ')}` : ''}</div>}
                    <div className="text-mute">{w.row.threshold} of {w.wish?.keeperIds.length ?? '?'} keepers must agree{w.row.item_version < it.version ? ' · needs refreshing' : ''}</div>
                  </li>
                ))}
              </ul>
            )}
            {!legacyForm && <button className="btn btn-ink w-full" onClick={() => setLegacyForm(true)} disabled={it.row.paused}>{wishes.length ? 'Add another legacy wish' : 'Pass this on, later'}</button>}
            {it.row.paused && <p className="text-xs text-mute mt-2">Lift the pause before making a legacy wish.</p>}
            <a href="/legacy" className="block text-sm underline text-mute mt-2">All legacy wishes</a>
          </div>
        )}

        <div className="card p-5">
          <h2 className="font-head font-semibold mb-2">Consent</h2>
          <p className="text-sm text-mute mb-2">Given by {p.consent.given_by} · {p.consent.method}{p.consent.witness ? ` · witnessed by ${p.consent.witness}` : ''}</p>
          <ul className="text-sm space-y-1">
            {(Object.keys(USE_LABELS) as UseKey[]).map((u) => (
              <li key={u} className="flex justify-between"><span>{USE_LABELS[u]}</span><span className={p.consent.uses[u] === 'yes' ? 'text-ok font-semibold' : 'text-mute'}>{p.consent.uses[u]}</span></li>
            ))}
          </ul>
          {p.labels.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{p.labels.map((l) => <span key={l} className="chip">{TK_LABELS[l] ?? l}</span>)}</div>}
        </div>

        {holder && (
          <div className="card p-5 space-y-2">
            <h2 className="font-head font-semibold mb-1">Holder tools</h2>
            {!it.row.paused ? (
              <button className="btn btn-ink w-full" onClick={() => newVersion(true)} disabled={!!busy}>{busy === 'pause' ? 'Re-locking…' : 'Pause for sorry business'}</button>
            ) : (
              <button className="btn btn-line w-full" onClick={() => newVersion(false)} disabled={!!busy}>{busy === 'unpause' ? 'Re-locking…' : 'Lift the pause'}</button>
            )}
            {canRelease && !rel && <button className="btn btn-gold w-full" onClick={() => setRel({ title: p.title, summary: '' })}>Prepare public summary</button>}
            {!canRelease && <p className="text-xs text-mute">Public summaries need consent for public use, and are never possible for paused, sacred, women&apos;s or men&apos;s items.</p>}
            <button className="btn btn-line w-full" onClick={download}>Download (decrypted, to this device)</button>
          </div>
        )}

        {rel && (
          <div className="card p-5 space-y-2 border-gold">
            <h2 className="font-head font-semibold">Public summary</h2>
            <p className="text-xs text-mute">Write a short summary for the public. The original stays private. The location is generalised to the shaded square.</p>
            <input className="input" value={rel.title} onChange={(e) => setRel({ ...rel, title: e.target.value })} aria-label="Summary title" />
            <textarea className="textarea" value={rel.summary} onChange={(e) => setRel({ ...rel, summary: e.target.value })} placeholder="What can be shared publicly" aria-label="Summary" />
            {blur && <DemoMap blurCell={{ ...blur, size: 100 }} height={220} />}
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={submitRelease} disabled={!rel.summary.trim() || busy === 'release'}>Send for sign-off</button>
              <button className="btn btn-line" onClick={() => setRel(null)}>Cancel</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
