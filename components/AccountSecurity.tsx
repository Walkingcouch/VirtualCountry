'use client';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { changePassphrase, newRecoveryCard } from '@/lib/vault';
import { checkPassphrase } from '@/lib/passphrase';
import { friendly } from '@/lib/errors';

/** Change the passphrase or make a new recovery card. Both need the current passphrase, typed again on this device. */
export default function AccountSecurity() {
  const { vault, userId, displayName, email, refresh } = useSession();
  const [mode, setMode] = useState<'none' | 'pass' | 'card'>('none');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [card, setCard] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = checkPassphrase(next, [displayName, email ?? '', (email ?? '').split('@')[0]]);

  const close = () => { setMode('none'); setCurrent(''); setNext(''); setNext2(''); setErr(''); };
  const wrongPass = 'That is not your current passphrase.';

  const savePass = async () => {
    if (!vault || !userId) return;
    setErr('');
    if (!strength.ok) return setErr(strength.hint);
    if (next !== next2) return setErr('The two new passphrases do not match.');
    setBusy(true);
    try {
      await changePassphrase(userId, vault, current, next);
      await refresh();
      close();
      setMsg('Passphrase changed. Use the new one next time you unlock.');
    } catch (e) { setErr(/ciphertext|decrypt|wrong secret/i.test((e as Error).message) ? wrongPass : friendly(e)); } finally { setBusy(false); }
  };

  const makeCard = async () => {
    if (!vault || !userId) return;
    setErr(''); setBusy(true);
    try {
      const code = await newRecoveryCard(userId, vault, current);
      await refresh();
      close();
      setCard(code);
    } catch (e) { setErr(/ciphertext|decrypt|wrong secret/i.test((e as Error).message) ? wrongPass : friendly(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <h2 className="font-head font-semibold mb-1">Passphrase and recovery card</h2>
      <p className="text-sm text-mute mb-3">Your passphrase and your recovery card are the only two ways into your private space. If you lose one, replace it here while you still have the other.</p>
      {msg && <p className="text-sm text-ok mb-3" role="status">{msg}</p>}
      {card && (
        <div className="mb-4 border border-gold rounded p-4" role="status">
          <p className="text-sm mb-2"><strong>Your new recovery card.</strong> Print it or write it down now. It is shown once, and your old card no longer works.</p>
          <div className="print-card bg-ink text-white rounded p-4 font-mono text-lg tracking-wider text-center select-all break-all">{card}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-line" onClick={() => window.print()}>Print</button>
            <button className="btn btn-ink" onClick={() => setCard('')}>I have saved it</button>
          </div>
        </div>
      )}
      {mode === 'none' && !card && (
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-line" onClick={() => { setMsg(''); setMode('pass'); }}>Change passphrase</button>
          <button className="btn btn-line" onClick={() => { setMsg(''); setMode('card'); }}>Make a new recovery card</button>
        </div>
      )}
      {mode !== 'none' && (
        <form className="space-y-3 max-w-md" onSubmit={(e) => { e.preventDefault(); if (mode === 'pass') savePass(); else makeCard(); }}>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current passphrase" aria-label="Current passphrase" required />
          {mode === 'pass' && (
            <>
              <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New passphrase (12 characters or more)" aria-label="New passphrase" required />
              {next && <p className="text-sm text-mute" aria-live="polite"><span className="font-semibold">{strength.label}.</span> {strength.hint}</p>}
              <input className="input" type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} placeholder="New passphrase again" aria-label="Repeat new passphrase" required />
            </>
          )}
          {mode === 'card' && <p className="text-sm text-mute">Your old card stops working as soon as the new one is made.</p>}
          {err && <p className="text-danger text-sm" role="alert">{err}</p>}
          <div className="flex gap-2">
            <button className="btn btn-gold" disabled={busy || !current}>{busy ? 'Working…' : mode === 'pass' ? 'Change passphrase' : 'Make new card'}</button>
            <button type="button" className="btn btn-line" onClick={close}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
