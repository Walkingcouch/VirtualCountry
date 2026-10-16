'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import { saveItemVersion, uploadMedia } from '@/lib/data';
import { TK_LABELS, USE_LABELS, type ItemPayload, type MediaRef, type UseAnswer, type UseKey } from '@/lib/model';
import AccessPicker, { type AccessValue } from '@/components/AccessPicker';
import DemoMap, { DEMO_PLACES } from '@/components/DemoMap';

const USES = Object.keys(USE_LABELS) as UseKey[];

export default function Record() {
  const router = useRouter();
  const { keys, userId, org, dir, displayName } = useSession();
  const { reload } = useItems();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<ItemPayload['kind']>('story');
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const [access, setAccess] = useState<AccessValue>({ level: 'only_me', groupId: '', people: [], gender: null, deceased: false, sacred: false, season: '' });
  const { level, groupId, people, gender, deceased, sacred, season } = access;
  const [labels, setLabels] = useState<string[]>(['tk-attribution']);
  const [method, setMethod] = useState<'app' | 'spoken' | 'written' | 'witnessed'>('app');
  const [witness, setWitness] = useState('');
  const [uses, setUses] = useState<Record<UseKey, UseAnswer>>({ family: 'no', community: 'no', school: 'no', research: 'no', government: 'no', public: 'no', ai: 'no' });
  const [files, setFiles] = useState<{ blob: Blob; name: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);

  const nearest = place ? DEMO_PLACES.reduce((a, b) => (Math.hypot(b.x - place.x, b.y - place.y) < Math.hypot(a.x - place.x, a.y - place.y) ? b : a)) : null;

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setFiles((f) => [...f, { blob: new Blob(chunks, { type: rec.mimeType }), name: `recording-${f.length + 1}.webm` }]); };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch { setErr('The microphone could not be opened on this device.'); }
  };
  const stopRec = () => { recorder.current?.stop(); setRecording(false); };

  const save = async () => {
    if (!keys || !userId || !org || !dir) return;
    if (!title.trim()) return setErr('Give it a short title.');
    if (!org.content_member) return setErr('Administrator-only accounts cannot hold content.');
    setBusy(true); setErr('');
    try {
      const itemId = crypto.randomUUID();
      const media: MediaRef[] = [];
      for (const f of files) media.push(await uploadMedia(org.id, itemId, f.blob, f.name));
      const payload: ItemPayload = {
        kind, title: title.trim(), body, tags: [],
        place: place ? { ...place, label: nearest ? `Near ${nearest.name} (demo)` : 'On the map' } : null,
        access: { level, groupId: level === 'group' ? groupId : undefined, people: level === 'people' ? people : undefined },
        restrictions: { gender, sacred, deceased, season: season || null },
        consent: { given_by: displayName, method, witness: method === 'witnessed' ? witness : undefined, uses, recorded_at: new Date().toISOString() },
        labels: [...labels, ...(gender === 'women' ? ['tk-women'] : gender === 'men' ? ['tk-men'] : []), ...(season ? ['tk-seasonal'] : [])],
        media, createdAt: new Date().toISOString(),
      };
      await saveItemVersion({ itemId, orgId: org.id, version: 1, payload, me: keys, myId: userId, dir, paused: false });
      await reload();
      router.push(`/stories/${itemId}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
      <section className="space-y-5">
        <div>
          <div className="label mb-1">Locked on this device before it is saved <span className="rule" /></div>
          <h1 className="font-head font-extrabold text-3xl">RECORD</h1>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['story', 'observation', 'note', 'recording', 'photo'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`chip !py-1.5 !px-3 ${kind === k ? '!bg-ink !text-white !border-ink' : ''}`}>{k}</button>
            ))}
          </div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" aria-label="Title" />
          <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type the story or notes here, or record audio below" aria-label="Story" />
          <div className="flex flex-wrap items-center gap-2">
            {!recording ? <button className="btn btn-ink" onClick={startRec}>● Record audio</button> : <button className="btn btn-danger" onClick={stopRec}>■ Stop</button>}
            <label className="btn btn-line">Add photo or file<input type="file" className="hidden" accept="image/*,audio/*,video/*,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((x) => [...x, { blob: f, name: f.name }]); }} /></label>
            {files.map((f, i) => <span key={i} className="chip">{f.name} · {(f.blob.size / 1024).toFixed(0)} KB</span>)}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-head font-semibold mb-2">Place</h2>
          <p className="text-sm text-mute mb-3">Tap the map to place it, or leave it off the map.</p>
          <DemoMap onPick={setPlace} picked={place} height={360} />
          {place && <p className="text-sm mt-2">Near {nearest?.name}. <button className="underline" onClick={() => setPlace(null)}>Remove place</button></p>}
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-head font-semibold">Consent</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} aria-label="How consent was given">
              <option value="app">Given in the app</option>
              <option value="spoken">Spoken, at the start of the recording</option>
              <option value="written">Written</option>
              <option value="witnessed">Witnessed by another member</option>
            </select>
            {method === 'witnessed' && <input className="input" value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="Witness name" />}
          </div>
          <div className="divide-y divide-line">
            {USES.map((u) => (
              <div key={u} className="flex items-center justify-between py-2 gap-3">
                <span className="text-[.95rem]">{USE_LABELS[u]}</span>
                <div className="flex gap-1">
                  {(['yes', 'no', 'later'] as UseAnswer[]).map((a) => (
                    <button key={a} onClick={() => setUses({ ...uses, [u]: a })} className={`chip !py-1 ${uses[u] === a ? (a === 'yes' ? '!bg-ok !text-white !border-ok' : '!bg-ink !text-white !border-ink') : ''}`}>{a}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-mute">Consent is saved with the item and can be changed at any time.</p>
        </div>
      </section>

      <aside className="space-y-5 lg:sticky lg:top-24 self-start">
        <div className="card p-5 space-y-3">
          <h2 className="font-head font-semibold">Who can open it</h2>
          <AccessPicker value={access} onChange={setAccess} />
          <div>
            <div className="text-sm font-semibold mb-1">Labels</div>
            <div className="flex flex-wrap gap-1">
              {['tk-attribution', 'tk-community-use', 'tk-verified', 'tk-non-commercial'].map((l) => (
                <button key={l} onClick={() => setLabels((x) => x.includes(l) ? x.filter((y) => y !== l) : [...x, l])} className={`chip ${labels.includes(l) ? '!bg-ink !text-white' : ''}`}>{TK_LABELS[l]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-5 border-gold">
          <h2 className="font-head font-semibold mb-1">Lock and save</h2>
          <p className="text-xs text-mute">It is locked on this device first. Only the people listed above receive a key. You can change this later.</p>
          {err && <p className="text-danger text-sm mt-3">{err}</p>}
          <button className="btn btn-gold w-full mt-4" disabled={busy || !title.trim()} onClick={save}>{busy ? 'Locking and saving…' : 'Lock and save'}</button>
        </div>
      </aside>
    </div>
  );
}
