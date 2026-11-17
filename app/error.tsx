'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** Shown when a screen fails. Offers a retry, a way home and a clean sign-out, so nobody is left on a blank page. */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const signOut = async () => {
    try { await supabase().auth.signOut(); } catch { /* sign-out is best effort when the service cannot be reached */ }
    window.location.href = '/login';
  };
  return (
    <div className="card p-6 max-w-xl mx-auto my-10" role="alert">
      <h1 className="font-head font-extrabold text-2xl mb-2">Something went wrong on this screen</h1>
      <p className="text-mute mb-1">Nothing you saved has been lost. Your stories stay locked in the same place.</p>
      <p className="text-mute text-sm mb-4 break-words">{error.message || 'No more detail is available.'}{error.digest ? ` (reference ${error.digest})` : ''}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-gold" onClick={reset}>Try again</button>
        <a className="btn btn-line" href="/">Go to Home</a>
        <button className="btn btn-line" onClick={signOut}>Sign out</button>
      </div>
      <p className="text-xs text-mute mt-4">If this keeps happening, email <a className="underline" href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a> and say which screen you were on.</p>
    </div>
  );
}
