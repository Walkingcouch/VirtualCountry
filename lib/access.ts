/**
 * Cultural permissions enforced by keys (Part E, E6).
 * Works out who may receive an item's key. Runs on the holder's device.
 * Cultural standing only counts if it is backed by a valid signature from a Cultural Authority.
 */
import { attestationMessage, verify } from './crypto';
import type { Attestation, Group, ItemPayload, Member } from './model';

export interface Directory {
  orgId: string;
  foundingCa: string | null;
  members: Member[];
  attestations: Attestation[];
  groups: Group[];
}

/**
 * Works out the Cultural Authorities and any appointments still waiting for a second signature.
 * Same rule as the database (vc_ca_set): appointments are read in the order they were signed. While the founding
 * Cultural Authority is the only one, they can appoint the second alone. After that, two Cultural Authorities must sign.
 */
export async function caState(dir: Directory): Promise<{ cas: Set<string>; pending: Map<string, string[]>; valid: Attestation[] }> {
  const byId = new Map(dir.members.map((m) => [m.user_id, m]));
  const live = dir.attestations.filter((a) => !a.revoked_at);
  const sigOk = async (a: Attestation) => {
    const issuer = byId.get(a.issuer_id);
    if (!issuer?.sign_pk) return false;
    return verify(a.sig, attestationMessage(a.org_id, a.subject_id, a.claim, new Date(a.issued_at).toISOString()), issuer.sign_pk);
  };
  const cas = new Set<string>(dir.foundingCa ? [dir.foundingCa] : []);
  const approvals = new Map<string, string[]>();
  const caClaims = live
    .filter((a) => a.claim === 'role:cultural_authority' && a.subject_id !== a.issuer_id)
    .sort((a, b) => (a.issued_at === b.issued_at ? a.id.localeCompare(b.id) : new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime()));
  for (const a of caClaims) {
    if (!cas.has(a.issuer_id) || cas.has(a.subject_id)) continue;
    if (!(await sigOk(a))) continue;
    const list = approvals.get(a.subject_id) ?? [];
    if (!list.includes(a.issuer_id)) list.push(a.issuer_id);
    approvals.set(a.subject_id, list);
    if (list.length >= Math.min(2, Math.max(cas.size, 1))) cas.add(a.subject_id);
  }
  const pending = new Map<string, string[]>();
  approvals.forEach((issuers, subject) => { if (!cas.has(subject)) pending.set(subject, issuers); });
  const valid: Attestation[] = [];
  for (const a of live) {
    if (!cas.has(a.issuer_id)) continue;
    if (a.claim === 'role:cultural_authority') { if (cas.has(a.subject_id)) valid.push(a); }
    else if (await sigOk(a)) valid.push(a);
  }
  return { cas, pending, valid };
}

/** Returns the attestations whose signatures check out and whose issuer is a valid Cultural Authority. */
export async function validAttestations(dir: Directory): Promise<Attestation[]> {
  return (await caState(dir)).valid;
}

export async function culturalAuthorities(dir: Directory): Promise<Set<string>> {
  return (await caState(dir)).cas;
}

export async function standings(dir: Directory): Promise<Map<string, Set<string>>> {
  const valid = await validAttestations(dir);
  const map = new Map<string, Set<string>>();
  for (const a of valid) {
    if (!map.has(a.subject_id)) map.set(a.subject_id, new Set());
    map.get(a.subject_id)!.add(a.claim);
  }
  return map;
}

/** Who receives the key. The holder always does. Administrators who are not content members never do. */
export async function eligibleRecipients(
  dir: Directory,
  holderId: string,
  payload: Pick<ItemPayload, 'access' | 'restrictions'>,
  paused = false,
): Promise<string[]> {
  if (paused) return [holderId];
  const active = dir.members.filter((m) => m.status === 'active' && m.content_member && m.enc_pk);
  let pool: string[];
  switch (payload.access.level) {
    case 'only_me': pool = []; break;
    case 'people': pool = payload.access.people ?? []; break;
    case 'group': pool = dir.groups.find((g) => g.id === payload.access.groupId)?.members ?? []; break;
    case 'community': pool = active.map((m) => m.user_id); break;
  }
  const activeIds = new Set(active.map((m) => m.user_id));
  pool = pool.filter((id) => activeIds.has(id));
  const gender = payload.restrictions.gender;
  if (gender) {
    const st = await standings(dir);
    const need = gender === 'women' ? 'standing:women' : 'standing:men';
    pool = pool.filter((id) => st.get(id)?.has(need));
  }
  return Array.from(new Set([holderId, ...pool]));
}

export function describeAccess(payload: Pick<ItemPayload, 'access' | 'restrictions'>, groups: Group[]): string {
  const base = {
    only_me: 'Only me',
    people: 'People I chose',
    group: `Group: ${groups.find((g) => g.id === payload.access.groupId)?.name ?? 'unknown'}`,
    community: 'Whole community',
  }[payload.access.level];
  const g = payload.restrictions.gender ? (payload.restrictions.gender === 'women' ? " · women's knowledge" : " · men's knowledge") : '';
  return base + g;
}
