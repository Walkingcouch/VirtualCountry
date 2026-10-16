'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './session';
import { useItems } from './items-context';
import { loadNotifications, type Note } from './notifications';

const Ctx = createContext<{ notes: Note[]; reload: () => Promise<void> }>({ notes: [], reload: async () => {} });
export const useNotes = () => useContext(Ctx);

export function NotesProvider({ children }: { children: ReactNode }) {
  const { org, dir, userId, keys, cas, caPending, keyAlerts, nameOf } = useSession();
  const { items } = useItems();
  const [notes, setNotes] = useState<Note[]>([]);
  const openItemIds = useMemo(() => new Set(items.map((i) => i.row.id)), [items]);
  const itemVersions = useMemo(() => new Map(items.map((i) => [i.row.id, i.row.current_version])), [items]);

  const reload = useCallback(async () => {
    if (!org || !dir || !userId || !keys) { setNotes([]); return; }
    try {
      setNotes(await loadNotifications({ org, dir, userId, keys, cas, caPending, keyAlerts, openItemIds, itemVersions, nameOf }));
    } catch { /* keep the last list if a refresh fails */ }
  }, [org, dir, userId, keys, cas, caPending, keyAlerts, openItemIds, itemVersions, nameOf]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 45000);
    const onRead = () => reload();
    window.addEventListener('vc-read', onRead);
    return () => { clearInterval(t); window.removeEventListener('vc-read', onRead); };
  }, [reload]);

  return <Ctx.Provider value={{ notes, reload }}>{children}</Ctx.Provider>;
}
