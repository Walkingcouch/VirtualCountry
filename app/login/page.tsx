'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DEMO_PASSPHRASE, DEMO_PASSWORD, DEMO_PEOPLE, supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { fetchVault, unlockWithPassphrase } from '@/lib/vault';
import { friendly } from '@/lib/errors';
import Logo from '@/components/Logo';

export default function Login() {
  const router = useRouter();
  const { status, setKeys, refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [ok, setOk] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'ready' || status === 'locked') router.replace('/');
    if (status === 'needs_setup') router.replace('/setup');
  }, [status, router]);

  const signIn = async (e: string, p: string) => {
    const { data, error } = await supabase().auth.signInWithPassword({ email: e, password: p });
    if (error) throw error;
    return data.user!.id;
  };

  const demo = async (e: string) => {
    setBusy(e); setMsg('');
    try {
      await supabase().auth.signOut();
      const id = await signIn(e, DEMO_PASSWORD);
      const v = await fetchVault(id);
      await refresh();
      if (v) setKeys(await unlockWithPassphrase(v, DEMO_PASSPHRASE));
      router.replace('/');
    } catch (err) {
      setMsg(friendly(err));
    } finally { setBusy(null); }
  };

  const forgot = async () => {
    setMsg(''); setOk('');
    if (!email.trim()) return setMsg('Type your email address first, then choose "Forgot your password?".');
    setBusy('forgot');
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
      if (error) throw error;
      setOk(`If there is an account for ${email.trim()}, we have sent it a link to choose a new password.`);
    } catch (err) { setMsg(friendly(err)); } finally { setBusy(null); }
  };

  const submit = async () => {
    setBusy('form'); setMsg(''); setOk('');
    try {
      if (mode === 'signup' && password !== password2) throw new Error('The two passwords do not match.');
      if (mode === 'signup' && password.length < 12) throw new Error('Use a password of at least 12 characters.');
      if (mode === 'signin') {
        await signIn(email, password);
        await refresh();
      } else {
        // The confirmation link returns to this site (not localhost). The address must also be allowed in Supabase Auth settings.
        const { error, data } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } });
        if (error) throw error;
        if (!data.session) {
          setMode('signin'); setPassword(''); setPassword2('');
          setOk(`We have sent a link to ${email}. Open it to confirm your account, then sign in here.`);
        } else await refresh();
      }
    } catch (err) {
      setMsg(friendly(err));
    } finally { setBusy(null); }
  };

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="max-w-6xl mx-auto px-4 py-6"><Link href="/"><Logo className="h-14 sm:h-20" /></Link></div>
      <div className="max-w-6xl mx-auto px-4 grid lg:grid-cols-[1fr_1.3fr] gap-10 pb-16">
        <section>
          <div className="label label-dark mb-3">Sign in</div>
          <h1 className="font-head font-extrabold text-4xl mb-6">VIRTUAL <span className="text-gold">COUNTRY</span></h1>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3 max-w-sm">
            <input className="input !text-text" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" required />
            <input className="input !text-text" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" required minLength={8} />
            {mode === 'signup' && (
              <input className="input !text-text" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="Confirm password" aria-label="Confirm password" required minLength={8} />
            )}
            <button className="btn btn-gold w-full" disabled={!!busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
            {mode === 'signin' && <button type="button" className="text-sm underline text-white/70 block" onClick={forgot} disabled={!!busy}>Forgot your password?</button>}
            {ok && <p className="text-[#A8E6C1] text-sm" role="status">{ok}</p>}
            {msg && <p className="text-[#F3B0A8] text-sm" role="alert">{msg}</p>}
            <button type="button" className="text-sm underline text-white/70" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(''); setOk(''); }}>
              {mode === 'signin' ? 'New here? Create an account and ask to join a community' : 'Already have an account? Sign in'}
            </button>
          </form>
          <p className="text-white/70 text-sm mt-6 max-w-sm flex flex-wrap gap-x-4 gap-y-1">
            <Link className="underline" href="/public">Public page</Link>
            <Link className="underline" href="/privacy">Privacy</Link>
            <Link className="underline" href="/terms">Terms</Link>
            <Link className="underline" href="/icip">ICIP statement</Link>
            <Link className="underline" href="/contact">Contact</Link>
          </p>
          <p className="text-white/60 text-xs mt-6 max-w-sm">Your password signs you in. Then your own passphrase unlocks your keys on your device. One-time codes and passkeys (face or fingerprint) are planned. Your passphrase is never sent to the server.</p>
        </section>

        {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
          <section>
            <div className="label label-dark mb-3">One-tap demo people <span className="rule" /></div>
            <p className="text-white/75 mb-4">Everyone and everything in Demo Country is invented. Sign in as different people to see the cultural locks working. Each person only sees what their keys open.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {DEMO_PEOPLE.map((p) => (
                <button key={p.email} onClick={() => demo(p.email)} disabled={!!busy} className="text-left p-4 rounded border border-white/15 hover:border-gold bg-white/[.03] transition">
                  <div className="font-head font-extrabold text-lg">{p.name}</div>
                  <div className="text-gold text-xs font-semibold tracking-wide mb-2">{p.role}</div>
                  <div className="text-white/65 text-sm">{busy === p.email ? 'Opening keys…' : p.tip}</div>
                </button>
              ))}
            </div>
            <p className="text-white/60 text-xs mt-4">Demo password {DEMO_PASSWORD} · demo passphrase {DEMO_PASSPHRASE}</p>
            <p className="text-white/60 text-sm mt-4">Need help? <a className="underline" href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a></p>
          </section>
        )}
      </div>
    </main>
  );
}
