'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from './session';
import { loadItems, type OpenItem } from './data';
import type { DenyEntry } from './guide';

interface ItemsValue { items: OpenItem[]; loading: boolean; failures: number; reload: () => Promise<void>; deny: DenyEntry[] }
const Ctx = createContext<ItemsValue | null>(null);
export const useItems = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useItems outside ItemsProvider');
  return v;
};

/** Words that must never be sent to the Guide: titles and phrases of stories, place labels, and other people's names. */
function buildDeny(items: OpenItem[], names: string[]): DenyEntry[] {
  const out: DenyEntry[] = [];
  for (const it of items) {
    const p = it.payload;
    const restricted = !!p.restrictions.gender || p.restrictions.sacred || it.row.paused || p.consent.uses.ai !== 'yes';
    const why = restricted ? 'words from a story that is not cleared for the AI helper' : 'words from one of your stories';
    out.push({ term: p.title, reason: why });
    if (p.place?.label) out.push({ term: p.place.label.replace(/\s*\(demo\)/i, ''), reason: 'a place name from your stories' });
    const sentences = p.body.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 5);
    for (const s of sentences) out.push({ term: s.split(' ').slice(0, 6).join(' '), reason: why });
  }
  for (const n of names) {
    const first = n.split(/[\s(]/)[0];
    if (first.length >= 4) out.push({ term: first, reason: "another person's name" });
  }
  return out;
}

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { keys, userId, org, dir, status } = useSession();
  const [items, setItems] = useState<OpenItem[]>([]);
  const [failures, setFailures] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!keys || !userId || !org || !dir) return;
    setLoading(true);
    try {
      const r = await loadItems(org.id, keys, userId, dir);
      setItems(r.items);
      setFailures(r.failures);
    } finally {
      setLoading(false);
    }
  }, [keys, userId, org, dir]);

  useEffect(() => { if (status === 'ready') reload().catch(console.error); else setItems([]); }, [status, reload]);

  const names = (dir?.members ?? []).filter((m) => m.user_id !== userId).map((m) => m.display_name);
  return <Ctx.Provider value={{ items, loading, failures, reload, deny: buildDeny(items, names) }}>{children}</Ctx.Provider>;
}
