'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { createVault } from '@/lib/vault';
import { allOrgs } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

export default function Setup() {
  const router = useRouter();
  const { status, userId, setKeys, refresh } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [code, setCode] = useState('');
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (status === 'signed_out') router.replace('/login'); }, [status, router]);
  useEffect(() => { if (step === 3) allOrgs().then(setOrgs).catch(() => setOrgs([])); }, [step]);

  const create = async () => {
    setErr('');
    if (pass.length < 8) return setErr('Use at least 8 characters. A few words is easier to remember.');
    if (pass !== pass2) return setErr('The two passphrases do not match.');
    setBusy(true);
    try {
      const r = await createVault(userId!, pass, name.trim() || 'New member');
      setCode(r.recoveryCode);
      setKeys(r.keys);
      setStep(2);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const join = async (orgId: string) => {
    setBusy(true); setErr('');
    const { error } = await supabase().from('org_members').insert({ org_id: orgId, user_id: userId, status: 'pending' });
    setBusy(false);
    if (error) return setErr(error.message);
    await refresh();
    router.replace('/');
  };

  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Logo className="h-16 mb-8" />
        <div className="label label-dark mb-2">Set up · step {step} of 3</div>
        {step === 1 && (
          <>
            <h1 className="font-head font-extrabold text-3xl mb-3">CHOOSE YOUR <span className="text-gold">PASSPHRASE</span></h1>
            <p className="text-white/75 mb-5">Your passphrase is like the key to your own locked room. It opens everything you keep here, on this device. Nobody else sees it, not even First Geospatial, so nobody can reset it for you. Next you will get a recovery card in case you forget it.</p>
            <div className="space-y-3">
              <input className="input !text-text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name as the community knows you" aria-label="Display name" />
              <input className="input !text-text" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Choose a passphrase" aria-label="Passphrase" />
              <input className="input !text-text" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Type it again" aria-label="Repeat passphrase" />
              {err && <p className="text-[#F3B0A8] text-sm">{err}</p>}
              <button className="btn btn-gold w-full" onClick={create} disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-head font-extrabold text-3xl mb-3">YOUR RECOVERY <span className="text-gold">CARD</span></h1>
            <p className="text-white/75 mb-4">Print this or write it down and keep it somewhere safe. It is the only way back in if you forget your passphrase, apart from in-person recovery.</p>
            <div className="bg-white text-ink rounded p-5 font-mono text-xl tracking-wider text-center select-all">{code}</div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-line" onClick={() => window.print()}>Print card</button>
              <button className="btn btn-gold flex-1" onClick={() => setStep(3)}>I have saved it</button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="font-head font-extrabold text-3xl mb-3">ASK TO <span className="text-gold">JOIN</span></h1>
            <p className="text-white/75 mb-4">Choose your community. Its administrator will confirm you with the community before you can see anything.</p>
            <div className="space-y-2">
              {orgs.map((o) => (
                <button key={o.id} className="w-full text-left p-4 rounded border border-white/15 hover:border-gold" onClick={() => join(o.id)} disabled={busy}>
                  <div className="font-head font-semibold">{o.name}</div>
                  <div className="text-white/60 text-sm">{o.kind === 'community' ? 'Community' : o.kind === 'partner' ? 'Partner organisation' : 'School'}</div>
                </button>
              ))}
              {err && <p className="text-[#F3B0A8] text-sm">{err}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
