'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

/** Never leave anyone stuck: a page that does not exist always offers a way home or a clean sign-out. */
export default function NotFound() {
  const startAgain = async () => {
    try { await supabase().auth.signOut(); } catch { /* already signed out */ }
    try { localStorage.removeItem('vc-org'); } catch { /* storage unavailable */ }
    window.location.href = '/login';
  };
  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Logo className="h-12 mb-8" />
        <div className="label label-dark mb-2">Page not found</div>
        <h1 className="font-head font-extrabold text-3xl mb-3">THIS PAGE <span className="text-gold">DOES NOT EXIST</span></h1>
        <p className="text-white/75 mb-6">The link may be old. Nothing is wrong with your account.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/" className="btn btn-gold flex-1">Go to home</Link>
          <button onClick={startAgain} className="btn btn-line !text-white !border-white/40 flex-1">Sign out and start again</button>
        </div>
        <p className="text-white/60 text-sm mt-6">Still stuck? Email <a className="underline" href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a></p>
      </div>
    </main>
  );
}
