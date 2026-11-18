'use client';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { leaveOrg } from '@/lib/data';
import { friendly } from '@/lib/errors';

/** Change the name others see, and close the account. */
export default function AccountDetails({ onExport }: { onExport: () => void }) {
  const { userId, displayName, orgs, refresh, signOut } = useSession();
  const [name, setName] = useState(displayName);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  const soleAdmin = orgs.filter((o) => o.status === 'active' && o.is_admin);

  const saveName = async () => {
    if (!userId) return;
    const v = name.trim().replace(/\s+/g, ' ');
    if (v.length < 1 || v.length > 80) return setErr('Use a name between 1 and 80 characters.');
    setBusy('name'); setErr(''); setMsg('');
    try {
      const { error } = await supabase().from('profiles').update({ display_name: v }).eq('id', userId);
      if (error) throw error;
      await refresh();
      setMsg('Name changed. Other people see it next time their screen refreshes.');
    } catch (e) { setErr(friendly(e)); } finally { setBusy(''); }
  };

  const close = async () => {
    if (!userId) return;
    setBusy('close'); setErr('');
    try {
      for (const o of orgs.filter((x) => (x.status === 'active' || x.status === 'pending') && !x.is_admin)) await leaveOrg(o.id, userId);
      const body = encodeURIComponent(`Please close my Virtual Country account.\n\nAccount reference: ${userId}\n\nI have already left my organisations in the app.`);
      window.location.href = `mailto:contact@firstgeospatial.com.au?subject=${encodeURIComponent('Close my Virtual Country account')}&body=${body}`;
      await signOut();
    } catch (e) { setErr(friendly(e)); setBusy(''); }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-head font-semibold mb-1">Your name</h2>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
          <input className="input !w-auto flex-1 min-w-[200px]" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="The name other people see" />
          <button className="btn btn-line" disabled={busy === 'name' || name.trim() === displayName}>Save name</button>
        </form>
        {msg && <p className="text-sm text-ok mt-2" role="status">{msg}</p>}
      </div>
      <div className="border-t border-line pt-4">
        <h2 className="font-head font-semibold mb-1">Close your account</h2>
        {!closing ? (
          <button className="btn btn-line !text-danger" onClick={() => setClosing(true)}>Close my account</button>
        ) : (
          <div className="border border-danger rounded p-3 text-sm space-y-2" role="alertdialog" aria-label="Close account">
            <p>This takes you out of every organisation straight away, then opens an email to First Geospatial asking for your sign-in to be removed for good.</p>
            <p>Items only you hold can no longer be opened by anyone once your account is gone. Items you shared stay with the people you shared them with until you change them.</p>
            {soleAdmin.length > 0 && <p className="text-danger">You are an administrator of {soleAdmin.map((o) => o.name).join(', ')}. Make someone else an administrator there first, then leave from Organisations.</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-line" onClick={onExport}>Download my data first</button>
              <button className="btn btn-danger" onClick={close} disabled={busy === 'close'}>{busy === 'close' ? 'Closing…' : 'Leave everything and send the request'}</button>
              <button className="btn btn-line" onClick={() => setClosing(false)}>Cancel</button>
            </div>
          </div>
        )}
        {err && <p className="text-sm text-danger mt-2" role="alert">{err}</p>}
      </div>
    </div>
  );
}
