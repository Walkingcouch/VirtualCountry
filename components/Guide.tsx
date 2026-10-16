'use client';
/** The AI Guide drawer (help mode). Erased on lock and whenever the area changes. */
import { useEffect, useState } from 'react';
import { answer, screen, suggestions, type Area, type DenyEntry } from '@/lib/guide';

/** Opens the Guide from anywhere, for example the help button in the phone header. */
export const openGuide = () => window.dispatchEvent(new Event('vc-open-guide'));

interface Turn { role: 'me' | 'guide' | 'blocked'; text: string }

export default function Guide({ area, deny }: { area: Area; deny: DenyEntry[] }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [warned, setWarned] = useState(false);

  useEffect(() => { setTurns([]); }, [area]);
  useEffect(() => {
    const o = () => setOpen(true);
    window.addEventListener('vc-open-guide', o);
    return () => window.removeEventListener('vc-open-guide', o);
  }, []);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const hit = screen(t, deny);
    if (hit) {
      setTurns((x) => [...x, { role: 'blocked', text: `Not sent. Your question contained ${hit}. The Guide only answers questions about using the app, so it never needs story details.` }]);
    } else {
      setTurns((x) => [...x, { role: 'me', text: t }, { role: 'guide', text: answer(area, t) }]);
    }
    setQ('');
  };

  return (
    <>
      <button onClick={() => { setOpen(true); }} className="hidden lg:inline-flex fixed bottom-5 right-5 z-40 btn btn-gold shadow-lg" aria-label="Open the Guide">
        ? Guide
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <aside className="h-full w-full max-w-md bg-paper shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} aria-label="Guide">
            <div className="bg-ink text-white px-5 py-4 flex items-center justify-between">
              <div>
                <div className="label label-dark">Help mode</div>
                <div className="font-head font-extrabold text-lg tracking-wide">GUIDE</div>
              </div>
              <button className="btn btn-line !min-h-0 !py-2" onClick={() => setOpen(false)}>Close</button>
            </div>
            {!warned && (
              <div className="m-4 card p-4 text-sm">
                <p className="font-semibold mb-1">Before you ask</p>
                <p>The Guide only explains how to use the app. It cannot see your stories. Please do not type cultural knowledge, names or places here. Questions are checked on your phone, and anything that matches your stories is not sent.</p>
                <button className="btn btn-gold mt-3" onClick={() => setWarned(true)}>I understand</button>
              </div>
            )}
            {warned && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {turns.length === 0 && <p className="text-mute text-sm">Tap a question or type your own.</p>}
                  {turns.map((t, i) => (
                    <div key={i} className={t.role === 'me' ? 'text-right' : ''}>
                      <div className={`inline-block max-w-[90%] rounded px-3 py-2 text-sm ${t.role === 'me' ? 'bg-ink text-white' : t.role === 'blocked' ? 'bg-[#FBEDE3] border border-[#EBC7AE]' : 'bg-white border border-line'}`}>
                        {t.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-line space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {suggestions(area).map((s) => (
                      <button key={s} className="chip hover:border-gold" onClick={() => ask(s)}>{s}</button>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
                    <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask how to do something" aria-label="Question for the Guide" />
                    <button className="btn btn-ink">Ask</button>
                  </form>
                  <p className="text-xs text-mute">No memory. Erased when you lock or change screens. Demo answers come from built-in help text on this device.</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
