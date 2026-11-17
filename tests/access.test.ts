import { describe, expect, it } from 'vitest';
import * as c from '../lib/crypto';
import { caState, eligibleRecipients, type Directory } from '../lib/access';
import { auditCsv, type AuditRow } from '../lib/data';
import type { Attestation, Member } from '../lib/model';

const ORG = 'org-1';
async function person(id: string, over: Partial<Member> = {}) {
  const keys = await c.newIdentity();
  const member: Member = { user_id: id, display_name: id, is_admin: false, content_member: true, status: 'active', enc_pk: keys.encPk, sign_pk: keys.signPk, ...over };
  return { keys, member };
}
let n = 0;
async function attest(issuer: { keys: c.IdentityKeys; member: Member }, subject: string, claim: Attestation['claim']): Promise<Attestation> {
  const issued_at = new Date(Date.UTC(2026, 0, 1, 0, 0, n++)).toISOString();
  return { id: `a${n}`, org_id: ORG, subject_id: subject, claim, issuer_id: issuer.member.user_id, issued_at, revoked_at: null,
    sig: await c.sign(c.attestationMessage(ORG, subject, claim, issued_at), issuer.keys.signSk) };
}

describe('Cultural Authority rules', () => {
  it('a removed Cultural Authority loses their powers but standings they signed stay valid', async () => {
    const rose = await person('rose'), tom = await person('tom'), maya = await person('maya');
    const atts = [await attest(rose, 'tom', 'role:cultural_authority'), await attest(tom, 'maya', 'standing:women')];
    const dir: Directory = { orgId: ORG, foundingCa: 'rose', members: [rose.member, tom.member, maya.member], attestations: atts, groups: [] };
    const before = await caState(dir);
    expect(before.cas.has('tom')).toBe(true);

    const after = await caState({ ...dir, members: [rose.member, { ...tom.member, status: 'removed' }, maya.member] });
    expect(after.cas.has('tom')).toBe(false);
    expect(after.cas.has('rose')).toBe(true);
    expect(after.valid.some((a) => a.subject_id === 'maya' && a.claim === 'standing:women')).toBe(true);
  });
  it('a forged appointment is ignored', async () => {
    const rose = await person('rose'), dan = await person('dan');
    const forged = { ...(await attest(dan, 'dan2', 'role:cultural_authority')), issuer_id: 'rose' };
    const dir: Directory = { orgId: ORG, foundingCa: 'rose', members: [rose.member, dan.member, (await person('dan2')).member], attestations: [forged], groups: [] };
    expect((await caState(dir)).cas.has('dan2')).toBe(false);
  });
  it('with two Cultural Authorities, a third needs both to sign', async () => {
    const rose = await person('rose'), tom = await person('tom'), maya = await person('maya');
    const base = [await attest(rose, 'tom', 'role:cultural_authority'), await attest(rose, 'maya', 'role:cultural_authority')];
    const dir: Directory = { orgId: ORG, foundingCa: 'rose', members: [rose.member, tom.member, maya.member], attestations: base, groups: [] };
    const one = await caState(dir);
    expect(one.cas.has('maya')).toBe(false);
    expect(one.pending.get('maya')).toEqual(['rose']);
    const two = await caState({ ...dir, attestations: [...base, await attest(tom, 'maya', 'role:cultural_authority')] });
    expect(two.cas.has('maya')).toBe(true);
  });
});

describe('who receives a key', () => {
  it('a group share reaches only active content members of that group', async () => {
    const rose = await person('rose'), maya = await person('maya'), sam = await person('sam', { content_member: false }), gone = await person('gone', { status: 'removed' });
    const dir: Directory = { orgId: ORG, foundingCa: 'rose', members: [rose.member, maya.member, sam.member, gone.member], attestations: [],
      groups: [{ id: 'g1', org_id: ORG, name: 'Family', kind: 'family', members: ['maya', 'sam', 'gone'] }] };
    const r = await eligibleRecipients(dir, 'rose', { access: { level: 'group', groupId: 'g1' }, restrictions: { gender: null, sacred: false, deceased: false, season: null } });
    expect(r.sort()).toEqual(['maya', 'rose']);
  });
});

describe('governance log export', () => {
  it('writes one quoted line per entry and escapes quotes', () => {
    const rows: AuditRow[] = [{ id: 1, actor_id: 'u1', action: 'member.active', target_type: 'user', target_id: '11111111-1111-4111-8111-111111111111', at: '2026-11-17T00:00:00Z', hash: 'h1', prev_hash: 'genesis', detail_hash: 'd', detail: { note: 'said "yes"' } }];
    const csv = auditCsv(rows, (id) => (id === 'u1' ? 'Sam' : 'Maya'), () => 'Member approved');
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('id,when_utc,who,what,action_code,target_type,target,detail,prev_hash,hash');
    expect(lines[1]).toContain('"Sam","Member approved","member.active","user","Maya"');
    expect(lines[1]).toContain('said \\""yes\\""');
  });
});
