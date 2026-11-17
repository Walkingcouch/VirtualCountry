'use client';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { DEMO_MODE, DEMO_PASSPHRASE } from '@/lib/supabase';
import { rewrapPassphrase, unlockWithPassphrase, unlockWithRecoveryCode } from '@/lib/vault';
import Logo from './Logo';
import { checkPassphrase } from '@/lib/passphrase';

export default function Unlock() {
  const { vault, setKeys, displayName, signOut, userId } = useSession();
  const [pass, setPass] = useState(DEMO_MODE ? DEMO_PASSPHRASE : '');
  const [mode, setMode] = useState<'pass' | 'recovery'>('pass');
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!vault) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'pass') {
        setKeys(await unlockWithPassphrase(vault, pass));
      } else {
        const check = checkPassphrase(newPass, [displayName]);
        if (!check.ok) throw new Error(`short:${check.hint}`);
        const { keys, amk } = await unlockWithRecoveryCode(vault, code);
        await rewrapPassphrase(userId!, amk, newPass);
        setKeys(keys);
      }
    } catch (e) {
      setErr(mode === 'pass' ? 'That passphrase did not work. Check it and try again.' : (e as Error).message.startsWith('short:') ? (e as Error).message.slice(6) : typeof navigator !== 'undefined' && !navigator.onLine ? 'You are offline. Connect and try again.' : 'That recovery code did not work.');
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-start gap-3 mb-8">
          <Logo className="h-14 sm:h-16" />
          <button className="text-sm text-white/70 underline" onClick={signOut}>← Not you? Sign out</button>
        </div>
        <div className="label label-dark mb-2">Your private space is locked</div>
        <h1 className="font-head font-extrabold text-3xl mb-2">WELCOME BACK{displayName ? ',' : ''} <span className="text-gold">{displayName.split(' ')[0].toUpperCase()}</span></h1>
        <p className="text-white/80 mb-2">Everything you keep here stays locked until you open it. Type your passphrase to open it on this phone or computer.</p>
        <p className="text-white/55 text-sm mb-6">Your passphrase stays on this device. It is never sent to us, so only you can open your things.</p>
        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="space-y-3">
          {mode === 'pass' ? (
            <input className="input !text-text" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase" aria-label="Passphrase" />
          ) : (
            <>
              <input className="input !text-text uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Recovery code" />
              <input className="input !text-text" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Choose a new passphrase" aria-label="New passphrase" />
            </>
          )}
          {err && <p className="text-[#F3B0A8] text-sm" role="alert">{err}</p>}
          <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Opening…' : 'Open'}</button>
        </form>
        {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && mode === 'pass' && <p className="text-white/50 text-xs mt-3">Demo passphrase: {DEMO_PASSPHRASE}</p>}
        <div className="flex justify-between mt-6 text-sm">
          <button className="underline text-white/70" onClick={() => setMode(mode === 'pass' ? 'recovery' : 'pass')}>{mode === 'pass' ? 'Forgot it? Use my recovery card' : 'Use my passphrase'}</button>
          <a className="underline text-white/70" href="/public">Public page</a>
        </div>
        <p className="text-white/65 text-xs mt-6">Lost both your passphrase and your recovery card? Nobody can open your things for you, including First Geospatial. In-person recovery with Recovery Keepers is planned but not available yet. For help with anything else, email contact@firstgeospatial.com.au.</p>
      </div>
    </main>
  );
}
