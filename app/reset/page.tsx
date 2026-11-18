'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendly } from '@/lib/errors';
import Logo from '@/components/Logo';

/** Second half of "Forgot your password?". The emailed link signs the person in for this one purpose. */
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabase();
    const { data: sub } = sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true); });
    sb.auth.getSession().then(({ data }) => { if (data.session) setReady(true); }).catch(() => undefined);
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async () => {
    setErr('');
    if (pass.length < 12) return setErr('Use at least 12 characters.');
    if (pass !== pass2) return setErr('The two passwords do not match.');
    setBusy(true);
    try {
      const { error } = await supabase().auth.updateUser({ password: pass });
      if (error) throw error;
      setDone(true);
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Logo className="h-14 mb-8" />
        <h1 className="font-head font-extrabold text-3xl mb-3">NEW <span className="text-gold">PASSWORD</span></h1>
        {done ? (
          <>
            <p className="text-white/80 mb-4" role="status">Your sign-in password has been changed.</p>
            <p className="text-white/70 text-sm mb-6">Your passphrase has not changed. You still need it, or your recovery card, to open your private space.</p>
            <Link className="btn btn-gold w-full" href="/">Carry on</Link>
          </>
        ) : !ready ? (
          <p className="text-white/75">Checking your link… If nothing happens, the link may have expired. <Link className="underline" href="/login">Ask for a new one</Link>.</p>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <p className="text-white/75 text-sm">This changes the password you sign in with. It does not change your passphrase.</p>
            <input className="input !text-text" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="New password (12 characters or more)" aria-label="New password" required />
            <input className="input !text-text" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="New password again" aria-label="Repeat new password" required />
            {err && <p className="text-[#F3B0A8] text-sm" role="alert">{err}</p>}
            <button className="btn btn-gold w-full" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
