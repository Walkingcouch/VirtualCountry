/**
 * Virtual Country cryptography (Part E, E4).
 * Only standard libsodium calls are used. No home-made cryptography.
 *
 *  - Content encryption:   XChaCha20-Poly1305 (AEAD)
 *  - Sealing keys:         X25519 sealed boxes
 *  - Signatures:           Ed25519
 *  - Passphrase stretching: Argon2id
 *  - Hashing:              BLAKE2b-256 (hex)
 *
 * Used by both the browser app and the Node seed script.
 */
import _sodium from 'libsodium-wrappers-sumo';

type Sodium = typeof _sodium;
let ready: Promise<Sodium> | null = null;

export function sodium(): Promise<Sodium> {
  if (!ready) ready = _sodium.ready.then(() => _sodium);
  return ready;
}

/* ---------- encoding ---------- */
export async function b64(bytes: Uint8Array): Promise<string> {
  const s = await sodium();
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}
export async function unb64(text: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.from_base64(text, s.base64_variants.ORIGINAL);
}
export const utf8 = (t: string) => new TextEncoder().encode(t);
export const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);

/* ---------- hashing ---------- */
export async function hashHex(data: Uint8Array | string): Promise<string> {
  const s = await sodium();
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return s.to_hex(s.crypto_generichash(32, bytes, null));
}

/* ---------- random ---------- */
export async function randomKey(): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_aead_xchacha20poly1305_ietf_keygen();
}
export async function randomBytes(n: number): Promise<Uint8Array> {
  const s = await sodium();
  return s.randombytes_buf(n);
}

/* ---------- AEAD ---------- */
export interface Box { nonce: string; ct: string }

export async function encrypt(key: Uint8Array, plaintext: Uint8Array, ad = ''): Promise<Box> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad ? utf8(ad) : null, null, nonce, key);
  return { nonce: await b64(nonce), ct: await b64(ct) };
}

export async function decrypt(key: Uint8Array, box: Box, ad = ''): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, await unb64(box.ct), ad ? utf8(ad) : null, await unb64(box.nonce), key);
}

export async function encryptJson(key: Uint8Array, value: unknown, ad = ''): Promise<Box> {
  return encrypt(key, utf8(JSON.stringify(value)), ad);
}
export async function decryptJson<T>(key: Uint8Array, box: Box, ad = ''): Promise<T> {
  return JSON.parse(fromUtf8(await decrypt(key, box, ad))) as T;
}

/* ---------- identity keys ---------- */
export interface IdentityKeys {
  encPk: string; encSk: string; // X25519
  signPk: string; signSk: string; // Ed25519
}

export async function newIdentity(): Promise<IdentityKeys> {
  const s = await sodium();
  const enc = s.crypto_box_keypair();
  const sig = s.crypto_sign_keypair();
  return {
    encPk: await b64(enc.publicKey), encSk: await b64(enc.privateKey),
    signPk: await b64(sig.publicKey), signSk: await b64(sig.privateKey),
  };
}

/* ---------- sealing (one key for one person) ---------- */
export async function seal(secret: Uint8Array, recipientEncPk: string): Promise<string> {
  const s = await sodium();
  return b64(s.crypto_box_seal(secret, await unb64(recipientEncPk)));
}
export async function unseal(sealed: string, me: IdentityKeys): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_box_seal_open(await unb64(sealed), await unb64(me.encPk), await unb64(me.encSk));
}

/* ---------- signatures ---------- */
export async function sign(message: string, signSk: string): Promise<string> {
  const s = await sodium();
  return b64(s.crypto_sign_detached(utf8(message), await unb64(signSk)));
}
export async function verify(signature: string, message: string, signPk: string): Promise<boolean> {
  const s = await sodium();
  try {
    return s.crypto_sign_verify_detached(await unb64(signature), utf8(message), await unb64(signPk));
  } catch {
    return false;
  }
}

/* ---------- passphrase / recovery code stretching ---------- */
export interface Wrapped { salt: string; nonce: string; ct: string; ops: number; mem: number }

export async function wrapWithPassphrase(secret: Uint8Array, passphrase: string): Promise<Wrapped> {
  const s = await sodium();
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
  const ops = s.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const mem = s.crypto_pwhash_MEMLIMIT_INTERACTIVE;
  const key = s.crypto_pwhash(32, utf8(passphrase.normalize('NFKC')), salt, ops, mem, s.crypto_pwhash_ALG_ARGON2ID13);
  const box = await encrypt(key, secret, 'vc-wrap-v1');
  return { salt: await b64(salt), nonce: box.nonce, ct: box.ct, ops, mem };
}

export async function unwrapWithPassphrase(w: Wrapped, passphrase: string): Promise<Uint8Array> {
  const s = await sodium();
  const key = s.crypto_pwhash(32, utf8(passphrase.normalize('NFKC')), await unb64(w.salt), w.ops, w.mem, s.crypto_pwhash_ALG_ARGON2ID13);
  return decrypt(key, { nonce: w.nonce, ct: w.ct }, 'vc-wrap-v1');
}

/** A 24-character recovery code shown as six groups of four, e.g. "K7QM-2XRA-...". About 120 bits. */
export async function newRecoveryCode(): Promise<string> {
  const s = await sodium();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = s.randombytes_buf(24);
  const chars = Array.from(bytes, (b) => alphabet[b % 32]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** Short words people can compare face to face to check a security key (E5). */
export async function safetyCode(signPk: string, encPk: string): Promise<string> {
  const words = ['river', 'stone', 'emu', 'wind', 'rain', 'star', 'ridge', 'sand', 'gum', 'creek', 'moon', 'hawk', 'fire', 'shell', 'cloud', 'seed'];
  const h = await hashHex(signPk + encPk);
  const out: string[] = [];
  for (let i = 0; i < 6; i++) out.push(words[parseInt(h.slice(i * 2, i * 2 + 2), 16) % 16]);
  return out.join(' ');
}

/* ---------- canonical messages that get signed ---------- */
export const itemMessage = (itemId: string, version: number, ctHash: string, recipientsHash: string) =>
  `vc-item-v1|${itemId}|${version}|${ctHash}|${recipientsHash}`;
export const attestationMessage = (orgId: string, subjectId: string, claim: string, issuedAt: string) =>
  `vc-att-v1|${orgId}|${subjectId}|${claim}|${issuedAt}`;
export const releaseMessage = (releaseId: string, bodyHash: string) => `vc-rel-v1|${releaseId}|${bodyHash}`;
export const messageMessage = (convId: string, keyVersion: number, ctHash: string) => `vc-msg-v1|${convId}|${keyVersion}|${ctHash}`;

export async function recipientsHash(ids: string[]): Promise<string> {
  return hashHex([...ids].sort().join(','));
}
export async function releaseBodyHash(title: string, summary: string, placeLabel: string, bx: number | null, by: number | null) {
  return hashHex([title, summary, placeLabel, bx ?? '', by ?? ''].join('\n'));
}
