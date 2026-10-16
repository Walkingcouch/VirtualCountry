'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { issueAttestation, loadAudit, revokeAttestations, verifyChain, type AuditRow } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import type { Attestation } from '@/lib/model';

const ACTION_TEXT: Record<string, string> = {
  'member.active': 'Member approved', 'member.pending': 'Asked to join', 'member.removed': 'Member removed',
  'member.admin_granted': 'Made administrator', 'member.admin_removed': 'Administrator role removed',
  'item.created': 'Item saved', 'item.shared': 'Item locked and keys given', 'item.paused': 'Item paused (sorry business)', 'item.unpaused': 'Pause lifted',
  'item.rekeyed': 'Who can open it was changed', 'item.deleted': 'Item deleted',
  'release.drafted': 'Public summary drafted', 'release.published': 'Public summary signed and published', 'release.withdrawn': 'Public summary withdrawn', 'release.rejected': 'Public summary sent back',
  'settings.changed': 'Settings changed', 'bridge.created': 'Bridge to another organisation opened', 'bridge.closed': 'Bridge closed',
  'legacy.wish_made': 'Legacy wish made', 'legacy.keeper_named': 'Legacy Keeper named', 'legacy.release_agreed': 'Keeper agreed to pass on knowledge',
  'legacy.release_withdrawn': 'Keeper withdrew agreement', 'legacy.received': 'Knowledge received through legacy', 'legacy.wish_revoked': 'Legacy wish cancelled',
  'legacy.wish_replaced': 'Legacy wish renewed', 'legacy.wish_fulfilled': 'Legacy wish completed',
};
const CLAIM_TEXT: Record<string, string> = {
  'standing:women': "women's standing", 'standing:men': "men's standing", 'role:cultural_authority': 'Cultural Authority', 'role:recovery_keeper': 'Recovery Keeper',
};
const describe = (a: string) => {
  if (ACTION_TEXT[a]) return ACTION_TEXT[a];
  const [kind, claim] = a.split(':');
  if (kind === 'attestation.issued') return `Confirmed ${CLAIM_TEXT[claim] ?? claim}`;
  if (kind === 'attestation.revoked') return `Removed ${CLAIM_TEXT[claim] ?? claim}`;
  return a;
};
const DETAIL_LABEL: Record<string, string> = {
  signed_by: 'Signed by', removed_by: 'Removed by', originally_signed_by: 'Originally signed by', decided_by: 'Decided by', subject: 'Person', claim: 'What',
  added: 'Now can open', removed: 'Can no longer open', people_now: 'People who can open it', version: 'Version', from: 'From', to: 'To', status: 'Status',
  keeper: 'Keeper', received_by: 'Received by', keepers_needed: 'Keepers who must agree', title: 'Title', drafted_by: 'Drafted by', content_member: 'Receives content keys',
  before: 'Before', after: 'After', issued_at: 'Signed at', item_version: 'Item version', wish: 'Legacy wish', item: 'Item',
};
const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

export default function Community() {
  const { org, dir, userId, keys, cas, caPending, standing, nameOf, refresh } = useSession();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [chain, setChain] = useState<{ ok: boolean; entries: number; head: string } | null>(null);
  const [settings, setSettings] = useState<{ ai_help: boolean; idle_lock_minutes: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'people' | 'items' | 'legacy' | 'releases'>('all');
  const isCa = cas.has(userId ?? '');
  const isAdmin = !!org?.is_admin;
  const seesDetail = isCa || isAdmin;

  const load = useCallback(async () => {
    if (!org) return;
    setAudit(await loadAudit(org.id));
    setChain(await verifyChain(org.id));
    const s = await supabase().from('org_settings').select('ai_help, idle_lock_minutes').eq('org_id', org.id).maybeSingle();
    setSettings(s.data);
  }, [org]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); await refresh(); await load(); } catch (e) { setMsg((e as Error).message); }
  };

  const setStatus = (uid: string, status: 'active' | 'removed') => run(async () => {
    const { error } = await supabase().from('org_members').update({ status, approved_by: userId, approved_at: new Date().toISOString() }).eq('org_id', org!.id).eq('user_id', uid);
    if (error) throw error;
  }, status === 'active' ? 'Approved. Holders will see an "Update access" prompt so the new member receives keys.' : 'Removed. Holders will re-lock their items without this person.');

  const attest = (uid: string, claim: Attestation['claim'], ok: string) => run(() => issueAttestation(org!.id, uid, claim, keys!, userId!), ok);
  const revoke = (uid: string, claim: Attestation['claim'], what: string) => {
    if (!confirm(`Remove ${what} from ${nameOf(uid).split(' (')[0]}? This is recorded in the governance log with your name.`)) return;
    run(() => revokeAttestations(org!.id, uid, claim), `${what[0].toUpperCase()}${what.slice(1)} removed. Holders' devices will stop including them where it applies.`);
  };
  const proposeCa = (uid: string) => {
    const one = cas.size <= 1;
    if (!confirm(`Put ${nameOf(uid).split(' (')[0]} forward as a Cultural Authority?\n\nCultural Authorities confirm cultural standing and sign public summaries.${one ? '' : '\n\nA second Cultural Authority must also agree before it takes effect.'}`)) return;
    attest(uid, 'role:cultural_authority', one ? 'Signed. They are now a Cultural Authority.' : 'Signed. Waiting for a second Cultural Authority to agree.');
  };

  const saveSettings = (patch: Partial<{ ai_help: boolean; idle_lock_minutes: number }>) => run(async () => {
    const { error } = await supabase().from('org_settings').update(patch).eq('org_id', org!.id);
    if (error) throw error;
  }, 'Settings saved and logged.');

  if (!org || !dir) return <p className="text-mute">Loading…</p>;
  const members = dir.members.filter((m) => m.status !== 'removed');

  const renderValue = (v: unknown): string => {
    if (Array.isArray(v)) return v.length ? v.map(renderValue).join(', ') : 'nobody';
    if (isUuid(v)) return nameOf(v as string).split(' (')[0];
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${renderValue(x)}`).join('; ');
    if (typeof v === 'string' && CLAIM_TEXT[v]) return CLAIM_TEXT[v];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
    return String(v);
  };
  const shown = audit.filter((a) => filter === 'all'
    || (filter === 'people' && (a.action.startsWith('member') || a.action.startsWith('attestation')))
    || (filter === 'items' && a.action.startsWith('item'))
    || (filter === 'legacy' && a.action.startsWith('legacy'))
    || (filter === 'releases' && a.action.startsWith('release')));

  return (
    <div className="space-y-8">
      <div>
        <div className="label mb-1">{org.kind === 'community' ? 'Community space' : 'Organisation'} · storage: {org.storage_option === 'cloud' ? 'Australian cloud (demo sandbox)' : org.storage_option} <span className="rule" /></div>
        <h1 className="font-head font-extrabold text-3xl break-words">{org.name.toUpperCase()}</h1>
      </div>
      {msg && <p className="card p-3 text-sm border-gold" role="status">{msg}</p>}

      <section>
        <h2 className="font-head font-semibold text-lg mb-3">People</h2>
        <div className="card divide-y divide-line">
          {members.map((m) => {
            const st = standing.get(m.user_id) ?? new Set<string>();
            const pend = caPending.get(m.user_id);
            const founding = dir.foundingCa === m.user_id;
            const me = m.user_id === userId;
            return (
              <div key={m.user_id} className="p-4 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold">{m.display_name}{me && ' (you)'}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.status === 'pending' && <span className="chip chip-warn">Waiting for approval</span>}
                    {cas.has(m.user_id) && <span className="chip !bg-gold !border-gold">Cultural Authority{founding ? ' (founding)' : ''}</span>}
                    {pend && <span className="chip chip-warn">Put forward as Cultural Authority by {pend.map((x) => nameOf(x).split(' (')[0]).join(', ')}. Needs a second Cultural Authority.</span>}
                    {st.has('standing:women') && <span className="chip chip-women">Women&apos;s standing ✓</span>}
                    {st.has('standing:men') && <span className="chip chip-men">Men&apos;s standing ✓</span>}
                    {st.has('role:recovery_keeper') && <span className="chip">Recovery Keeper</span>}
                    {m.is_admin && <span className="chip">Administrator</span>}
                    {!m.content_member && <span className="chip chip-warn">No content keys</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isAdmin && m.status === 'pending' && <button className="btn btn-gold !min-h-10" onClick={() => setStatus(m.user_id, 'active')}>Approve</button>}
                  {isAdmin && m.status === 'active' && !me && <button className="btn btn-danger !min-h-10" onClick={() => { if (confirm(`Remove ${m.display_name} from ${org.name}?`)) setStatus(m.user_id, 'removed'); }}>Remove</button>}
                  {isCa && m.status === 'active' && m.content_member && (
                    <>
                      {!st.has('standing:women') && !st.has('standing:men') && (
                        <>
                          <button className="btn btn-line !min-h-10" onClick={() => attest(m.user_id, 'standing:women', 'Signed confirmation recorded.')}>Confirm women&apos;s standing</button>
                          <button className="btn btn-line !min-h-10" onClick={() => attest(m.user_id, 'standing:men', 'Signed confirmation recorded.')}>Confirm men&apos;s standing</button>
                        </>
                      )}
                      {st.has('standing:women') && <button className="btn btn-line !min-h-10" onClick={() => revoke(m.user_id, 'standing:women', "women's standing")}>Undo women&apos;s standing</button>}
                      {st.has('standing:men') && <button className="btn btn-line !min-h-10" onClick={() => revoke(m.user_id, 'standing:men', "men's standing")}>Undo men&apos;s standing</button>}
                      {!st.has('role:recovery_keeper') ? (
                        <button className="btn btn-line !min-h-10" onClick={() => attest(m.user_id, 'role:recovery_keeper', 'Signed. They are now a Recovery Keeper.')}>Make Recovery Keeper</button>
                      ) : <button className="btn btn-line !min-h-10" onClick={() => revoke(m.user_id, 'role:recovery_keeper', 'the Recovery Keeper role')}>Remove Recovery Keeper</button>}
                      {!me && !cas.has(m.user_id) && !pend && <button className="btn btn-line !min-h-10" onClick={() => proposeCa(m.user_id)}>Put forward as Cultural Authority</button>}
                      {!me && pend && !pend.includes(userId ?? '') && <button className="btn btn-gold !min-h-10" onClick={() => attest(m.user_id, 'role:cultural_authority', 'Agreed. They are now a Cultural Authority.')}>Agree: make Cultural Authority</button>}
                      {!me && pend && <button className="btn btn-line !min-h-10" onClick={() => revoke(m.user_id, 'role:cultural_authority', 'the Cultural Authority nomination')}>Withdraw nomination</button>}
                      {!me && !founding && cas.has(m.user_id) && <button className="btn btn-danger !min-h-10" onClick={() => revoke(m.user_id, 'role:cultural_authority', 'the Cultural Authority role')}>Remove Cultural Authority</button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-mute mt-2">Standings and roles are confirmed by Cultural Authorities with a digital signature, and can be undone. A new Cultural Authority needs two Cultural Authorities to agree (while there is only one, they can appoint the second). Administrators cannot confirm standings, and cannot give themselves keys.</p>
      </section>

      {isAdmin && settings && (
        <section>
          <h2 className="font-head font-semibold text-lg mb-3">Settings (administrator)</h2>
          <div className="card p-4 grid sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between gap-3"><span>AI Guide (help mode) for everyone</span><input type="checkbox" checked={settings.ai_help} onChange={(e) => saveSettings({ ai_help: e.target.checked })} /></label>
            <label className="flex items-center justify-between gap-3"><span>Lock automatically after (minutes)</span>
              <select className="select !w-28" value={settings.idle_lock_minutes} onChange={(e) => saveSettings({ idle_lock_minutes: Number(e.target.value) })}>{[2, 5, 10, 15, 30, 60].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-head font-semibold text-lg">Governance log</h2>
          {chain && (chain.ok ? <span className="chip chip-ok">✓ Chain intact · {chain.entries} entries · head {chain.head.slice(0, 10)}…</span> : <span className="chip chip-warn">Chain broken: the log has been tampered with</span>)}
        </div>
        <p className="text-sm text-mute mb-3">
          Every action is linked to the one before it by a fingerprint, so any change or deletion is detected. The log records actions only. It never contains content.
          {seesDetail ? ' As an administrator or Cultural Authority you can open each entry for full detail: who signed, who was added or removed, and what changed.' : ' Administrators and Cultural Authorities can open each entry for more detail.'}
        </p>
        <div className="flex flex-wrap gap-1 mb-3" role="tablist">
          {(['all', 'people', 'items', 'legacy', 'releases'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`chip !py-1.5 !px-3 ${filter === f ? '!bg-ink !text-white' : ''}`}>{f === 'all' ? 'Everything' : f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="card divide-y divide-line text-sm">
          {shown.map((a) => (
            <div key={a.id}>
              <button className="w-full text-left p-3 grid grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_auto] gap-2 hover:bg-sand" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                <span className="text-mute order-2 sm:order-1 col-span-2 sm:col-span-1">{new Date(a.at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="order-1 sm:order-2"><b>{nameOf(a.actor_id).split(' (')[0]}</b> · {describe(a.action)}{a.target_type === 'user' ? ` · ${nameOf(a.target_id).split(' (')[0]}` : ''}</span>
                <span className="order-1 sm:order-3 text-mute">{a.detail_hash ? (open === a.id ? '−' : '+') : ''}</span>
              </button>
              {open === a.id && (
                <div className="px-3 pb-3 sm:pl-[162px] space-y-1">
                  {a.detail ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {Object.entries(a.detail).map(([k, v]) => (
                        <div key={k} className="contents"><dt className="text-mute">{DETAIL_LABEL[k] ?? k.replace(/_/g, ' ')}</dt><dd className="break-words">{renderValue(v)}</dd></div>
                      ))}
                    </dl>
                  ) : a.detail_hash ? <p className="text-mute">Detail is only visible to administrators and Cultural Authorities.</p> : <p className="text-mute">No extra detail was recorded for this older entry.</p>}
                  <p className="font-mono text-xs text-mute break-all">Fingerprint {a.hash.slice(0, 16)}… follows {a.prev_hash.slice(0, 16)}…</p>
                </div>
              )}
            </div>
          ))}
          {shown.length === 0 && <p className="p-3 text-mute">Nothing here yet.</p>}
        </div>
      </section>
    </div>
  );
}
