'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { useItems } from '@/lib/items-context';
import { safetyCode } from '@/lib/crypto';
import Icon from '@/components/Icon';

export default function Me() {
  const { keys, displayName, email, signOut, lock, nameOf, org, cas, standing, userId } = useSession();
  const { items } = useItems();
  const [code, setCode] = useState('');
  useEffect(() => { if (keys) safetyCode(keys.signPk, keys.encPk).then(setCode); }, [keys]);
  const mine = standing.get(userId ?? '') ?? new Set<string>();
  const [name, role] = [displayName.split(' (')[0], displayName.match(/\(([^)]+)\)/)?.[1]];

  const exportAll = () => {
    const data = items.map((i) => ({ id: i.row.id, holder: nameOf(i.row.holder_id), version: i.version, ...i.payload }));
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), person: displayName, community: org?.name, items: data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'virtual-country-my-data.json'; a.click();
  };

  return (
    <div className="max-w-3xl space-y-5">
      <section className="rounded bg-ink text-white p-5 sm:p-7 overflow-hidden">
        <div className="label label-dark mb-2">Your account</div>
        <h1 className="font-head font-extrabold text-2xl sm:text-3xl break-words leading-tight">{name.toUpperCase()}</h1>
        {role && <p className="text-gold text-sm mt-1">{role}</p>}
        <p className="text-white/70 text-sm mt-2 break-all">{email}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {org && <span className="chip !bg-white/10 !text-white !border-white/20">{org.name}</span>}
          {cas.has(userId ?? '') && <span className="chip !bg-gold !border-gold">Cultural Authority</span>}
          {mine.has('standing:women') && <span className="chip !bg-white/10 !text-white !border-white/20">Women&apos;s standing</span>}
          {mine.has('standing:men') && <span className="chip !bg-white/10 !text-white !border-white/20">Men&apos;s standing</span>}
          {mine.has('role:recovery_keeper') && <span className="chip !bg-white/10 !text-white !border-white/20">Recovery Keeper</span>}
          {org?.is_admin && <span className="chip !bg-white/10 !text-white !border-white/20">Administrator</span>}
        </div>
      </section>

      <div className="card p-5">
        <h2 className="font-head font-semibold mb-1 flex items-center gap-2"><Icon name="lock" className="w-5 h-5" /> Lock</h2>
        <p className="text-sm mb-3">Lock closes your private space on this device straight away, like locking the door when you leave a room. Nothing is deleted. Your passphrase opens it again. Use it on a shared phone or computer, or before you hand your phone to someone. The app also locks itself after a few minutes without use.</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-gold" onClick={lock}>Lock now</button>
          <button className="btn btn-line" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-head font-semibold mb-1">Safety code</h2>
        <p className="text-sm text-mute mb-3">Six words made from your security key. Compare them face to face with another member. If the words match what they see for you, nobody has swapped your key.</p>
        <div className="font-head font-extrabold text-xl sm:text-2xl tracking-wide text-gold-text break-words">{code}</div>
      </div>

      <div className="card p-5">
        <h2 className="font-head font-semibold mb-1">Your data</h2>
        <p className="text-sm text-mute mb-3">Download everything you can open, unlocked, to this device. You can leave at any time and take your material with you.</p>
        <button className="btn btn-ink" onClick={exportAll}>Download my data ({items.length} items)</button>
      </div>

      <div className="card p-5">
        <h2 className="font-head font-semibold mb-1">Getting back in</h2>
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li>Forgot your passphrase: use your printed recovery card on the unlock screen.</li>
          <li>New phone: sign in, then open with your passphrase or recovery card.</li>
          <li>Lost everything: ask your Community Administrator for in-person recovery. Two Recovery Keepers confirm who you are face to face. Nobody can read your stories at any point.</li>
        </ul>
      </div>
    </div>
  );
}
