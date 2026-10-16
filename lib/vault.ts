/**
 * The person's key vault (Part E, E4 and E7).
 * The Account Master Key (AMK) never leaves the device unencrypted. It is stored wrapped by the
 * person's passphrase and, separately, by their printed recovery code.
 */
import * as c from './crypto';
import { supabase } from './supabase';

export interface VaultRow {
  amk_pin: c.Wrapped;
  amk_recovery: c.Wrapped;
  identity: c.Box;
}

async function openIdentity(amk: Uint8Array, identity: c.Box): Promise<c.IdentityKeys> {
  return c.decryptJson<c.IdentityKeys>(amk, identity, 'vc-identity-v1');
}

export async function fetchVault(userId: string): Promise<VaultRow | null> {
  const { data, error } = await supabase().from('vaults').select('amk_pin, amk_recovery, identity').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as VaultRow | null;
}

export async function unlockWithPassphrase(vault: VaultRow, passphrase: string): Promise<c.IdentityKeys> {
  const amk = await c.unwrapWithPassphrase(vault.amk_pin, passphrase);
  return openIdentity(amk, vault.identity);
}

export async function unlockWithRecoveryCode(vault: VaultRow, code: string): Promise<{ keys: c.IdentityKeys; amk: Uint8Array }> {
  const amk = await c.unwrapWithPassphrase(vault.amk_recovery, code.trim().toUpperCase());
  return { keys: await openIdentity(amk, vault.identity), amk };
}

/** First-time set-up on a new account: create keys, wrap them, publish public keys. Returns the recovery code to print. */
export async function createVault(userId: string, passphrase: string, displayName: string): Promise<{ keys: c.IdentityKeys; recoveryCode: string }> {
  const keys = await c.newIdentity();
  const amk = await c.randomKey();
  const recoveryCode = await c.newRecoveryCode();
  const row = {
    user_id: userId,
    amk_pin: await c.wrapWithPassphrase(amk, passphrase),
    amk_recovery: await c.wrapWithPassphrase(amk, recoveryCode),
    identity: await c.encryptJson(amk, keys, 'vc-identity-v1'),
  };
  const sb = supabase();
  const p = await sb.from('profiles').upsert({ id: userId, display_name: displayName });
  if (p.error) throw p.error;
  const v = await sb.from('vaults').insert(row);
  if (v.error) throw v.error;
  const k = await sb.from('public_keys').insert({ user_id: userId, enc_pk: keys.encPk, sign_pk: keys.signPk });
  if (k.error) throw k.error;
  return { keys, recoveryCode };
}

/** Change the passphrase after unlocking with the recovery code. */
export async function rewrapPassphrase(userId: string, amk: Uint8Array, newPassphrase: string) {
  const { error } = await supabase().from('vaults').update({ amk_pin: await c.wrapWithPassphrase(amk, newPassphrase), updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw error;
}
