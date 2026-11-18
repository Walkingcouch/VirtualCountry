'use client';
import { useState } from 'react';
import { safetyCode } from '@/lib/crypto';

/** Shows the six-word safety code this device has for another person, to compare face to face with their Me screen. */
export default function SafetyCheck({ name, signPk, encPk }: { name: string; signPk: string | null; encPk: string | null }) {
  const [code, setCode] = useState('');
  if (!signPk || !encPk) return null;
  return code ? (
    <div className="basis-full text-sm bg-sand rounded p-3" role="status">
      <div className="text-mute">Safety code for {name}. It should match the words on their Me screen.</div>
      <div className="font-head font-extrabold text-lg tracking-wide text-gold-text break-words">{code}</div>
      <button className="underline text-xs mt-1" onClick={() => setCode('')}>Hide</button>
    </div>
  ) : (
    <button className="btn btn-line !min-h-10" onClick={() => { safetyCode(signPk, encPk).then(setCode).catch(() => setCode('Could not be worked out on this device')); }}>Check safety code</button>
  );
}
