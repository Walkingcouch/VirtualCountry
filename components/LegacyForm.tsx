'use client';
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { createWish, describeWhen, WHEN_TEXT, type LegacyRecipient, type LegacyWhen, type LegacyWish } from '@/lib/legacy';
import type { OpenItem } from '@/lib/data';

/** The holder's legacy wish for one item: who receives it later, who never does, when, and who keeps the parts of the key. */
export default function LegacyForm({ it, onDone, onCancel }: { it: OpenItem; onDone: (msg: string) => void; onCancel: () => void }) {
  const { dir, userId, keys, org, displayName, cas, standing, nameOf } = useSession();
  const [recipients, setRecipients] = useState<LegacyRecipient[]>([]);
  const [future, setFuture] = useState('');
  const [never, setNever] = useState<{ userId?: string; name: string }[]>([]);
  const [neverName, setNeverName] = useState('');
  const [when, setWhen] = useState<LegacyWhen>('passing_and_age');
  const [age, setAge] = useState(18);
  const [date, setDate] = useState('');
  const [restsWithMe, setRestsWithMe] = useState(true);
  const [message, setMessage] = useState('');
  const [keepers, setKeepers] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(2);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const members = useMemo(() => (dir?.members ?? []).filter((m) => m.status === 'active' && m.content_member && m.user_id !== userId), [dir, userId]);
  const neverIds = new Set(never.map((n) => n.userId).filter(Boolean) as string[]);
  const trusted = (id: string) => cas.has(id) || standing.get(id)?.has('role:recovery_keeper');
  const keeperChoices = [...members].filter((m) => !neverIds.has(m.user_id)).sort((a, b) => Number(!!trusted(b.user_id)) - Number(!!trusted(a.user_id)));
  const gender = it.payload.restrictions.gender;

  const toggleRecipient = (id: string, name: string) => setRecipients((r) => r.some((x) => x.kind === 'member' && x.userId === id) ? r.filter((x) => !(x.kind === 'member' && x.userId === id)) : [...r, { kind: 'member', userId: id, name }]);
  const toggleNever = (id: string, name: string) => {
    setNever((n) => n.some((x) => x.userId === id) ? n.filter((x) => x.userId !== id) : [...n, { userId: id, name }]);
    setRecipients((r) => r.filter((x) => !(x.kind === 'member' && x.userId === id)));
    setKeepers((k) => k.filter((x) => x !== id));
  };
  const toggleKeeper = (id: string) => setKeepers((k) => {
    const next = k.includes(id) ? k.filter((x) => x !== id) : [...k, id];
    setThreshold((t) => Math.max(2, Math.min(t, next.length || 2)));
    return next;
  });

  const save = async () => {
    if (!dir || !userId || !keys || !org) return;
    setErr('');
    if (!recipients.length) return setErr('Add at least one person, or describe someone not here yet.');
    if (keepers.length < 2) return setErr('Choose at least two Legacy Keepers.');
    if ((when === 'age' || when === 'passing_and_age') && (!age || age < 1)) return setErr('Enter an age.');
    if (when === 'date' && !date) return setErr('Choose a date.');
    setBusy(true);
    try {
      const wish: LegacyWish = {
        itemTitle: it.payload.title, holderName: displayName, recipients, never, when,
        age: when === 'age' || when === 'passing_and_age' ? age : undefined, date: when === 'date' ? date : undefined,
        restsWithMe, message: message.trim(), gender, keeperIds: keepers, createdAt: new Date().toISOString(),
      };
      await createWish({ orgId: org.id, itemId: it.row.id, version: it.version, wish, keeperIds: keepers, threshold, me: keys, myId: userId, dir });
      onDone(`Legacy wish saved. ${keepers.length} keepers each hold one part of the key. ${threshold} must agree before anyone receives it.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5 space-y-5 border-gold">
      <div>
        <div className="label mb-1">Legacy access</div>
        <h2 className="font-head font-extrabold text-xl">PASS THIS ON, LATER</h2>
        <p className="text-sm text-mute mt-1">Choose who should receive &ldquo;{it.payload.title}&rdquo; in the future, who never should, and when. Your Legacy Keepers each hold one part of the key, so nobody can open it until enough of them agree your wishes are met.</p>
      </div>

      <section className="space-y-2">
        <h3 className="font-head font-semibold">1. Who should receive it</h3>
        <p className="text-xs text-mute">People already in the community, including young people. Add a note such as &ldquo;my granddaughter, when she is grown&rdquo;.</p>
        <div className="flex flex-wrap gap-2">
          {members.filter((m) => !neverIds.has(m.user_id)).map((m) => {
            const on = recipients.some((x) => x.kind === 'member' && x.userId === m.user_id);
            return <button type="button" key={m.user_id} onClick={() => toggleRecipient(m.user_id, m.display_name)} className={`chip !py-1.5 ${on ? '!bg-ok !text-white !border-ok' : ''}`}>{m.display_name}</button>;
          })}
        </div>
        {recipients.filter((r) => r.kind === 'member').map((r, i) => r.kind === 'member' && (
          <input key={r.userId} className="input !text-sm" placeholder={`Note about ${r.name.split(' (')[0]} (optional)`} value={r.note ?? ''}
            onChange={(e) => setRecipients((all) => all.map((x) => (x.kind === 'member' && x.userId === r.userId ? { ...x, note: e.target.value } : x)))} aria-label={`Note ${i + 1}`} />
        ))}
        <p className="text-xs text-mute pt-1">Someone not here yet, such as great-grandchildren not yet born. Your keepers will identify them when the time comes.</p>
        <div className="flex gap-2">
          <input className="input" value={future} onChange={(e) => setFuture(e.target.value)} placeholder="e.g. My great-grandchildren through my son Peter's line" aria-label="Describe a future person" />
          <button type="button" className="btn btn-line" onClick={() => { if (future.trim()) { setRecipients((r) => [...r, { kind: 'future', description: future.trim() }]); setFuture(''); } }}>Add</button>
        </div>
        <ul className="space-y-1">
          {recipients.filter((r) => r.kind === 'future').map((r, i) => r.kind === 'future' && (
            <li key={i} className="flex items-center justify-between gap-2 text-sm bg-sand rounded px-3 py-2">
              <span>🌱 {r.description}</span>
              <button type="button" className="underline text-mute" onClick={() => setRecipients((all) => all.filter((x) => x !== r))}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-head font-semibold">2. Never to</h3>
        <p className="text-xs text-mute">People who must never receive it. Your keepers see this list, and the app will not let them release to these people. They cannot be keepers either.</p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = neverIds.has(m.user_id);
            return <button type="button" key={m.user_id} onClick={() => toggleNever(m.user_id, m.display_name)} className={`chip !py-1.5 ${on ? '!bg-danger !text-white !border-danger' : ''}`}>{m.display_name}</button>;
          })}
        </div>
        <div className="flex gap-2">
          <input className="input" value={neverName} onChange={(e) => setNeverName(e.target.value)} placeholder="Name someone not on Virtual Country" aria-label="Name to exclude" />
          <button type="button" className="btn btn-line" onClick={() => { if (neverName.trim()) { setNever((n) => [...n, { name: neverName.trim() }]); setNeverName(''); } }}>Add</button>
        </div>
        <div className="flex flex-wrap gap-1">{never.filter((n) => !n.userId).map((n, i) => <span key={i} className="chip !bg-[#FBEDE3]">✕ {n.name} <button type="button" onClick={() => setNever((all) => all.filter((x) => x !== n))} aria-label={`Remove ${n.name}`}>×</button></span>)}</div>
      </section>

      <section className="space-y-2">
        <h3 className="font-head font-semibold">3. When</h3>
        <div className="grid gap-2">
          {(Object.keys(WHEN_TEXT) as LegacyWhen[]).map((w) => (
            <label key={w} className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer ${when === w ? 'border-ink bg-sand' : 'border-line'}`}>
              <input type="radio" name="when" checked={when === w} onChange={() => setWhen(w)} /> {WHEN_TEXT[w]}
            </label>
          ))}
        </div>
        {(when === 'age' || when === 'passing_and_age') && (
          <label className="flex items-center gap-2 text-sm">Age <input className="input !w-24" type="number" min={1} max={120} value={age} onChange={(e) => setAge(Number(e.target.value))} /></label>
        )}
        {when === 'date' && <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />}
        <label className="flex items-start gap-2 text-sm pt-1">
          <input type="checkbox" className="mt-1" checked={restsWithMe} onChange={(e) => setRestsWithMe(e.target.checked)} />
          <span>If nobody meets these wishes, the knowledge rests with me. Nobody will ever be able to open it.</span>
        </label>
        {!restsWithMe && <p className="text-xs text-mute">Your keepers may choose a suitable person from the community, still never anyone on your &ldquo;never to&rdquo; list.</p>}
      </section>

      <section className="space-y-2">
        <h3 className="font-head font-semibold">4. A message for them (optional)</h3>
        <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Words for the person who receives this. Only your keepers see it before then." aria-label="Message" />
      </section>

      <section className="space-y-2">
        <h3 className="font-head font-semibold">5. Legacy Keepers</h3>
        <p className="text-xs text-mute">People you trust to honour your wishes after you. Cultural Authorities and Recovery Keepers are listed first. Each keeper holds one part of the key, which opens nothing on its own.</p>
        <div className="flex flex-wrap gap-2">
          {keeperChoices.map((m) => (
            <button type="button" key={m.user_id} onClick={() => toggleKeeper(m.user_id)} className={`chip !py-1.5 ${keepers.includes(m.user_id) ? '!bg-ink !text-white' : ''}`}>
              {m.display_name}{trusted(m.user_id) ? ' ★' : ''}
            </button>
          ))}
        </div>
        {keepers.length >= 2 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            How many keepers must agree
            <select className="select !w-auto" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {Array.from({ length: keepers.length - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} of {keepers.length}</option>)}
            </select>
          </label>
        )}
      </section>

      {gender && <p className="text-xs bg-sand rounded p-3">This is {gender === 'women' ? "women's" : "men's"} knowledge. Keepers can only pass it to people a Cultural Authority has confirmed for {gender === 'women' ? "women's" : "men's"} standing.</p>}

      <div className="bg-ink text-white rounded p-4 text-sm space-y-1">
        <div className="label label-dark">In plain words</div>
        <p>
          {recipients.length ? recipients.map((r) => (r.kind === 'member' ? r.name.split(' (')[0] : r.description)).join('; ') : 'Nobody yet'}
          {' '}may receive this {describeWhen({ when, age, date }).toLowerCase()}
          {never.length ? `, never ${never.map((n) => n.name.split(' (')[0]).join(', ')}` : ''}.
          {' '}{keepers.length >= 2 ? `${threshold} of ${keepers.map((k) => nameOf(k).split(' (')[0]).join(', ')} must agree.` : 'Choose your keepers.'}
          {restsWithMe ? ' Otherwise it rests with you.' : ''}
        </p>
      </div>

      {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-gold flex-1" onClick={save} disabled={busy}>{busy ? 'Locking…' : 'Save legacy wish'}</button>
        <button className="btn btn-line" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
