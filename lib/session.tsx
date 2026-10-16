'use client';
/**
 * Session: who is signed in, whether their keys are unlocked, and which community they are in.
 * Keys live only in memory. They are wiped when the app locks, after inactivity, or on sign-out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IdentityKeys } from './crypto';
import { supabase } from './supabase';
import { fetchVault, type VaultRow } from './vault';
import { loadDirectory, myOrgs, type MyOrg } from './data';
import { caState, standings, type Directory } from './access';

type Status = 'loading' | 'signed_out' | 'needs_setup' | 'locked' | 'ready';

interface SessionValue {
  status: Status;
  userId: string | null;
  email: string | null;
  displayName: string;
  vault: VaultRow | null;
  keys: IdentityKeys | null;
  orgs: MyOrg[];
  org: MyOrg | null;
  dir: Directory | null;
  cas: Set<string>;
  caPending: Map<string, string[]>;
  standing: Map<string, Set<string>>;
  keyAlerts: string[];
  idleMinutes: number;
  setKeys: (k: IdentityKeys) => void;
  setOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  lock: () => void;
  signOut: () => Promise<void>;
  nameOf: (id: string | null | undefined) => string;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

function readPins(userId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(`vc-pins-${userId}`) || '{}'); } catch { return {}; }
}
function writePins(userId: string, pins: Record<string, string>) {
  try { localStorage.setItem(`vc-pins-${userId}`, JSON.stringify(pins)); } catch { /* storage unavailable */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [vault, setVault] = useState<VaultRow | null>(null);
  const [keys, setKeysState] = useState<IdentityKeys | null>(null);
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [dir, setDir] = useState<Directory | null>(null);
  const [cas, setCas] = useState<Set<string>>(new Set());
  const [caPending, setCaPending] = useState<Map<string, string[]>>(new Map());
  const [standing, setStanding] = useState<Map<string, Set<string>>>(new Map());
  const [keyAlerts, setKeyAlerts] = useState<string[]>([]);
  const [idleMinutes, setIdleMinutes] = useState(10);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUser = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    const u = data.session?.user;
    if (!u) { setStatus('signed_out'); setUserId(null); setKeysState(null); return; }
    setUserId(u.id);
    setEmail(u.email ?? null);
    const v = await fetchVault(u.id);
    setVault(v);
    const p = await supabase().from('profiles').select('display_name').eq('id', u.id).maybeSingle();
    setDisplayName(p.data?.display_name ?? u.email ?? '');
    if (!v) { setStatus('needs_setup'); return; }
    const o = await myOrgs(u.id);
    setOrgs(o);
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vc-org') : null;
    const active = o.filter((x) => x.status === 'active');
    setOrgId((prev) => (prev && active.some((a) => a.id === prev) ? prev : (active.find((x) => x.id === saved)?.id ?? active[0]?.id ?? null)));
    setStatus((s) => (s === 'ready' ? 'ready' : 'locked'));
  }, []);

  useEffect(() => {
    loadUser().catch(() => setStatus('signed_out'));
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setKeysState(null); setDir(null); setOrgs([]); setOrgId(null); setStatus('signed_out'); }
      if (event === 'SIGNED_IN') loadUser();
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser]);

  const org = useMemo(() => orgs.find((o) => o.id === orgId) ?? null, [orgs, orgId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const o = await myOrgs(userId);
    setOrgs(o);
    const current = o.find((x) => x.id === orgId);
    if (!current || current.status !== 'active') { setDir(null); return; }
    const d = await loadDirectory(current);
    setDir(d);
    const ca = await caState(d);
    setCas(ca.cas);
    setCaPending(ca.pending);
    setStanding(await standings(d));
    const s = await supabase().from('org_settings').select('idle_lock_minutes').eq('org_id', current.id).maybeSingle();
    if (s.data) setIdleMinutes(s.data.idle_lock_minutes);
    // Key pinning (E5): warn when someone's security key changes
    const pins = readPins(userId);
    const alerts: string[] = [];
    for (const m of d.members) {
      if (!m.sign_pk) continue;
      const fp = m.sign_pk + m.enc_pk;
      if (pins[m.user_id] && pins[m.user_id] !== fp) alerts.push(m.display_name);
      pins[m.user_id] = fp;
    }
    writePins(userId, pins);
    setKeyAlerts(alerts);
  }, [userId, orgId]);

  useEffect(() => {
    if (status === 'ready' && orgId) refresh().catch(console.error);
    if (orgId) try { localStorage.setItem('vc-org', orgId); } catch { /* ignore */ }
  }, [status, orgId, refresh]);

  const lock = useCallback(() => { setKeysState(null); setStatus((s) => (s === 'ready' ? 'locked' : s)); }, []);

  // Auto-lock after inactivity (E5)
  useEffect(() => {
    if (status !== 'ready') return;
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, idleMinutes * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [status, idleMinutes, lock]);

  const setKeys = useCallback((k: IdentityKeys) => { setKeysState(k); setStatus('ready'); }, []);
  const signOut = useCallback(async () => { setKeysState(null); setDir(null); await supabase().auth.signOut(); setStatus('signed_out'); }, []);
  const nameOf = useCallback((id: string | null | undefined) => {
    if (!id) return 'Unknown';
    if (id === userId) return displayName || 'Me';
    return dir?.members.find((m) => m.user_id === id)?.display_name ?? 'Someone outside this community';
  }, [dir, userId, displayName]);

  const value: SessionValue = {
    status, userId, email, displayName, vault, keys, orgs, org, dir, cas, caPending, standing, keyAlerts, idleMinutes,
    setKeys, setOrgId: (id) => setOrgId(id), refresh: async () => { await loadUser(); await refresh(); }, lock, signOut, nameOf,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
