import { describe, expect, it } from 'vitest';
import * as c from '../lib/crypto';
import { eligibleRecipients } from '../lib/access';
import { screen } from '../lib/guide';

describe('crypto', () => {
  it('only the sealed recipient can open a key', async () => {
    const a = await c.newIdentity(), b = await c.newIdentity();
    const k = await c.randomKey();
    const s = await c.seal(k, b.encPk);
    expect(await c.b64(await c.unseal(s, b))).toBe(await c.b64(k));
    await expect(c.unseal(s, a)).rejects.toBeTruthy();
  });
  it('tampered ciphertext is rejected', async () => {
    const k = await c.randomKey();
    const box = await c.encryptJson(k, { t: 'x' }, 'ad');
    const bad = { ...box, ct: box.ct.slice(0, -4) + 'AAAA' };
    await expect(c.decryptJson(k, bad, 'ad')).rejects.toBeTruthy();
    await expect(c.decryptJson(k, box, 'other-ad')).rejects.toBeTruthy();
  });
  it('wrong passphrase does not open the vault', async () => {
    const k = await c.randomKey();
    const w = await c.wrapWithPassphrase(k, 'right one');
    await expect(c.unwrapWithPassphrase(w, 'wrong one')).rejects.toBeTruthy();
  });
});

describe('cultural locks', () => {
  it("women's items reach only confirmed women; admins never receive keys", async () => {
    const ca = await c.newIdentity(), w = await c.newIdentity(), m = await c.newIdentity(), admin = await c.newIdentity();
    const mem = (id: string, k: c.IdentityKeys, content = true) => ({ user_id: id, display_name: id, is_admin: !content, content_member: content, status: 'active' as const, enc_pk: k.encPk, sign_pk: k.signPk });
    const at = new Date().toISOString();
    const att = { id: '1', org_id: 'o', subject_id: 'w', claim: 'standing:women' as const, issuer_id: 'ca', issued_at: at, sig: await c.sign(c.attestationMessage('o', 'w', 'standing:women', at), ca.signSk), revoked_at: null };
    const dir = { orgId: 'o', foundingCa: 'ca', members: [mem('ca', ca), mem('w', w), mem('m', m), mem('admin', admin, false)], attestations: [att], groups: [] };
    const r = await eligibleRecipients(dir, 'ca', { access: { level: 'community' }, restrictions: { gender: 'women', sacred: false, deceased: false, season: null } });
    expect(r.sort()).toEqual(['ca', 'w']);
    const all = await eligibleRecipients(dir, 'ca', { access: { level: 'community' }, restrictions: { gender: null, sacred: false, deceased: false, season: null } });
    expect(all).not.toContain('admin');
    const paused = await eligibleRecipients(dir, 'ca', { access: { level: 'community' }, restrictions: { gender: null, sacred: false, deceased: false, season: null } }, true);
    expect(paused).toEqual(['ca']);
  });
});

describe('AI Guide screening', () => {
  const deny = [{ term: 'Seven Springs', reason: 'a place name' }, { term: "Women's knowledge: demo placeholder", reason: 'a title' }];
  it('blocks story words, places, coordinates and recovery codes', () => {
    expect(screen('tell me about seven springs', deny)).toBeTruthy();
    expect(screen('-23.7012, 133.8807', deny)).toBeTruthy();
    expect(screen('ABCD-EF23-GH45-JK67', deny)).toBeTruthy();
    expect(screen('How do I record a story?', deny)).toBeNull();
  });
});
