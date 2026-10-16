import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import * as c from '../lib/crypto';
import { combine, split } from '../lib/shamir';
import { caState, type Directory } from '../lib/access';
import type { Attestation, Member } from '../lib/model';

const rnd = (n: number) => new Uint8Array(randomBytes(n));

describe('legacy key flow', () => {
  it('two of three keepers pass the item key to a great-grandchild; one keeper alone cannot', async () => {
    const [k1, k2, k3, child] = await Promise.all([c.newIdentity(), c.newIdentity(), c.newIdentity(), c.newIdentity()]);
    const itemKey = await c.randomKey();
    const check = await c.hashHex(itemKey);
    // Holder's device: split and seal one part to each keeper
    const parts = split(itemKey, 3, 2, rnd);
    const sealed = await Promise.all([k1, k2, k3].map((k, i) => c.seal(parts[i], k.encPk)));
    // Keepers 1 and 3 agree: each re-seals only their own part to the child
    const toChild = [await c.seal(await c.unseal(sealed[0], k1), child.encPk), await c.seal(await c.unseal(sealed[2], k3), child.encPk)];
    // Child's device joins the parts and checks them against the published fingerprint
    const joined = combine(await Promise.all(toChild.map((s) => c.unseal(s, child))));
    expect(await c.hashHex(joined)).toBe(check);
    // One part alone does not give the key
    const one = await c.unseal(toChild[0], child);
    expect(await c.b64(one.slice(1))).not.toBe(await c.b64(itemKey));
    // A keeper cannot open another keeper's part
    await expect(c.unseal(sealed[1], k1)).rejects.toBeTruthy();
  });
});

describe('Cultural Authority appointments', () => {
  const ids = { rose: 'r0000000-0000-0000-0000-000000000001', tom: 't0000000-0000-0000-0000-000000000002', dan: 'd0000000-0000-0000-0000-000000000003', org: 'o0000000-0000-0000-0000-000000000000' };
  const people = async () => {
    const out: Record<string, c.IdentityKeys> = {};
    for (const k of ['rose', 'tom', 'dan']) out[k] = await c.newIdentity();
    return out;
  };
  const att = async (issuer: string, subject: string, keys: c.IdentityKeys, at: string, n: number): Promise<Attestation> => ({
    id: `a${n}`, org_id: ids.org, subject_id: subject, issuer_id: issuer, claim: 'role:cultural_authority', issued_at: at, revoked_at: null,
    sig: await c.sign(c.attestationMessage(ids.org, subject, 'role:cultural_authority', new Date(at).toISOString()), keys.signSk),
  });
  const dirOf = (k: Record<string, c.IdentityKeys>, attestations: Attestation[]): Directory => ({
    orgId: ids.org, foundingCa: ids.rose, groups: [], attestations,
    members: (['rose', 'tom', 'dan'] as const).map((n) => ({ user_id: ids[n], display_name: n, is_admin: false, content_member: true, status: 'active', enc_pk: k[n].encPk, sign_pk: k[n].signPk } as Member)),
  });

  it('the founding CA can appoint the second alone, but a third needs two signatures', async () => {
    const k = await people();
    const a1 = await att(ids.rose, ids.tom, k.rose, '2026-09-01T00:00:00.000Z', 1);
    const a2 = await att(ids.rose, ids.dan, k.rose, '2026-10-01T00:00:00.000Z', 2);
    let s = await caState(dirOf(k, [a1, a2]));
    expect(s.cas.has(ids.tom)).toBe(true);
    expect(s.cas.has(ids.dan)).toBe(false);
    expect(s.pending.get(ids.dan)).toEqual([ids.rose]);
    const a3 = await att(ids.tom, ids.dan, k.tom, '2026-10-02T00:00:00.000Z', 3);
    s = await caState(dirOf(k, [a1, a2, a3]));
    expect(s.cas.has(ids.dan)).toBe(true);
    expect(s.pending.size).toBe(0);
  });

  it('removing an appointment takes the role away', async () => {
    const k = await people();
    const a1 = { ...(await att(ids.rose, ids.tom, k.rose, '2026-09-01T00:00:00.000Z', 1)), revoked_at: '2026-10-05T00:00:00.000Z' };
    const s = await caState(dirOf(k, [a1]));
    expect(s.cas.has(ids.tom)).toBe(false);
  });
});
