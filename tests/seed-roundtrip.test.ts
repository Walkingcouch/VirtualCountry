/**
 * Proves the demo data round-trips with the same code the app uses:
 * vault unlock -> unseal envelope -> decrypt item -> verify holder signature -> verify attestations.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as c from '../lib/crypto';
import { validAttestations } from '../lib/access';
import { itemAd, type ItemPayload } from '../lib/model';

const sql = readFileSync('supabase/seed.sql', 'utf8');
const val = (re: RegExp) => { const m = sql.match(re); if (!m) throw new Error('not found ' + re); return m; };

describe('seed round trip', () => {
  it('Maya unlocks her vault and opens the women-only item; signature verifies', async () => {
    const maya = val(/'([0-9a-f-]{36})', 'Maya \(teacher, demo\)'/)[1];
    const v = val(new RegExp(`insert into public.vaults \\(user_id, amk_pin, amk_recovery, identity\\) values \\('${maya}', '([^']+)'::jsonb, '([^']+)'::jsonb, '([^']+)'::jsonb\\)`));
    const amk = await c.unwrapWithPassphrase(JSON.parse(v[1]), 'country-demo');
    const keys = await c.decryptJson<c.IdentityKeys>(amk, JSON.parse(v[3]), 'vc-identity-v1');
    // first item is the women-only one
    const ver = val(/insert into public.item_versions \(item_id, version, nonce, ciphertext, ct_hash, recipients, recipients_hash, author_id, author_sig, created_at\) values \('([0-9a-f-]{36})', 1, '([^']+)', '([^']+)', '([^']+)', array\[([^\]]+)\]::uuid\[\], '([^']+)', '([^']+)', '([^']+)'/);
    const [_, itemId, nonce, ct, ctHash, recips, rHash, author, sig] = ver;
    const env = val(new RegExp(`values \\('${itemId}', 1, '${maya}', '([^']+)'\\)`))[1];
    const key = await c.unseal(env, keys);
    const payload = await c.decryptJson<ItemPayload>(key, { nonce, ct }, itemAd(itemId, 1));
    expect(payload.restrictions.gender).toBe('women');
    const authorPk = val(new RegExp(`values \\('${author}', '[^']+', '([^']+)'\\)`))[1];
    expect(await c.hashHex(ct)).toBe(ctHash);
    const ids = recips.split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(await c.recipientsHash(ids)).toBe(rHash);
    expect(await c.verify(sig, c.itemMessage(itemId, 1, ctHash, rHash), authorPk)).toBe(true);
    // Daniel has no envelope for this item
    const daniel = val(/'([0-9a-f-]{36})', 'Daniel \(Ranger, demo\)'/)[1];
    expect(sql.includes(`values ('${itemId}', 1, '${daniel}'`)).toBe(false);
  });

  it('attestations verify, including after a database round trip of the timestamp', async () => {
    const people = [...sql.matchAll(/insert into public.public_keys \(user_id, enc_pk, sign_pk\) values \('([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => ({ user_id: m[1], enc_pk: m[2], sign_pk: m[3], display_name: '', is_admin: false, content_member: true, status: 'active' as const }));
    const org = val(/insert into public.orgs \(id, name, kind, founding_ca, storage_option\) values \('([^']+)', 'Demo Country', 'community', '([^']+)'/);
    const atts = [...sql.matchAll(/insert into public.attestations \(id, org_id, subject_id, claim, issuer_id, issued_at, sig\) values \('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)'\)/g)]
      .map((m) => ({ id: m[1], org_id: m[2], subject_id: m[3], claim: m[4] as 'standing:women', issuer_id: m[5], issued_at: m[6].replace('Z', '+00:00'), sig: m[7], revoked_at: null }));
    const valid = await validAttestations({ orgId: org[1], foundingCa: org[2], members: people, attestations: atts, groups: [] });
    expect(valid.length).toBe(atts.length);
    // a forged attestation (signed by a non-authority) is rejected
    const forged = { ...atts[0], id: 'x', issuer_id: people[3].user_id };
    const v2 = await validAttestations({ orgId: org[1], foundingCa: org[2], members: people, attestations: [...atts, forged], groups: [] });
    expect(v2.find((a) => a.id === 'x')).toBeUndefined();
  });
});
