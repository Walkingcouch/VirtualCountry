'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { createVault } from '@/lib/vault';
import { allOrgs, askToJoin, createOrg } from '@/lib/data';
import Logo from '@/components/Logo';
import { checkPassphrase } from '@/lib/passphrase';
import { friendly } from '@/lib/errors';

export default function Setup() {
  const router = useRouter();
  const { status, userId, email, setKeys, refresh } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [show, setShow] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (status === 'signed_out') router.replace('/login'); }, [status, router]);
  useEffect(() => { if (step === 3) allOrgs().then(setOrgs).catch(() => setOrgs([])); }, [step]);

  const create = async () => {
    setErr('');
    if (!name.trim()) return setErr('Type the name your community knows you by.');
    if (!strength.ok) return setErr(strength.hint);
    if (pass !== pass2) return setErr('The two passphrases do not match.');
    setBusy(true);
    try {
      const r = await createVault(userId!, pass, name.trim() || 'New member');
      setCode(r.recoveryCode);
      setKeys(r.keys);
      setStep(2);
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };

  const strength = checkPassphrase(pass, [name, email ?? '', (email ?? '').split('@')[0]]);
  const lastGroup = code.split('-').at(-1) ?? '';
  const cardConfirmed = confirmCode.trim().toUpperCase() === lastGroup && lastGroup !== '';

  // Leaving this step by accident would lose the only copy of the recovery card.
  useEffect(() => {
    if (step !== 2) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step]);

  const [newName, setNewName] = useState('');
  const startNew = async () => {
    setBusy(true); setErr('');
    try { await createOrg(newName, 'community'); await refresh(); router.replace('/community'); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };

  const join = async (orgId: string) => {
    setBusy(true); setErr('');
    try { await askToJoin(orgId, userId!); } catch (e) { setBusy(false); return setErr(friendly(e)); }
    setBusy(false);
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
              <input className="input !text-text" type={show ? 'text' : 'password'} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Choose a passphrase (12 characters or more)" aria-label="Passphrase" aria-describedby="pass-hint" />
              {pass && (
                <div id="pass-hint" aria-live="polite">
                  <div className="flex gap-1" aria-hidden="true">
                    {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 flex-1 rounded ${strength.score >= n ? (strength.ok ? 'bg-[#7ED9A0]' : 'bg-[#F3B0A8]') : 'bg-white/15'}`} />)}
                  </div>
                  <p className="text-sm text-white/75 mt-1"><span className="font-semibold">{strength.label}.</span> {strength.hint}</p>
                </div>
              )}
              <input className="input !text-text" type={show ? 'text' : 'password'} autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Type it again" aria-label="Repeat passphrase" />
              <label className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show what I am typing</label>
              {err && <p className="text-[#F3B0A8] text-sm" role="alert">{err}</p>}
              <button className="btn btn-gold w-full" onClick={create} disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-head font-extrabold text-3xl mb-3">YOUR RECOVERY <span className="text-gold">CARD</span></h1>
            <p className="text-white/75 mb-4">Print this or write it down and keep it somewhere safe. It is the only way back in if you forget your passphrase. Without the passphrase or this card, nobody can open your things, including First Geospatial.</p>
            <div className="bg-white text-ink rounded p-5 font-mono text-xl tracking-wider text-center select-all">{code}</div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-line" onClick={() => window.print()}>Print card</button>
            </div>
            <div className="mt-5 p-4 rounded border border-white/15">
              <label htmlFor="card-check" className="block text-sm text-white/85 mb-2">To make sure you have it, type the <strong>last four characters</strong> of the card from your printed or written copy.</label>
              <input id="card-check" className="input !text-text uppercase font-mono tracking-widest !w-40" maxLength={4} autoComplete="off" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
              <button className="btn btn-gold w-full mt-3" disabled={!cardConfirmed} onClick={() => setStep(3)}>I have saved it. Continue</button>
              <p className="text-white/60 text-xs mt-2">This card is shown once. First Geospatial cannot see it or send it to you again. You can make a new card later from the Me screen while you still know your passphrase.</p>
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
            <div className="mt-6 pt-5 border-t border-white/15">
              <div className="font-head font-semibold mb-1">Or start a new organisation</div>
              <p className="text-white/60 text-sm mb-3">You become its first administrator. Use this to set up your own community or partner organisation for testing.</p>
              <div className="flex gap-2">
                <input className="input !bg-white/5 !text-white !border-white/20" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Organisation name" aria-label="New organisation name" maxLength={80} />
                <button className="btn btn-gold" disabled={busy || newName.trim().length < 3} onClick={startNew}>Start</button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
