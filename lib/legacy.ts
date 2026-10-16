/**
 * Legacy access: passing knowledge on to people later, including people who are children now
 * or not yet born, and never to people the holder names.
 *
 * How it works
 * - The holder's device splits the item key into shares (Shamir). Each Legacy Keeper gets one share, sealed to them.
 *   Any `threshold` keepers together can rebuild the key. Fewer cannot. The platform never can.
 * - The wishes (who, who never, when, a message) are encrypted with a wish key that only the holder and the keepers hold.
 * - When the time comes, each keeper decides on their own device. If they agree, their device re-seals its share
 *   to the person chosen. Once enough keepers agree, that person's device joins the shares and receives the key.
 * - If nobody ever meets the wishes, nobody can open it. The knowledge rests with the holder.
 */
import * as c from './crypto';
import { combine, split } from './shamir';
import { supabase } from './supabase';
import type { Directory } from './access';
import type { Gender } from './model';
import { myItemKey } from './data';

export type LegacyRecipient =
  | { kind: 'member'; userId: string; name: string; note?: string }
  | { kind: 'future'; description: string; note?: string };

export type LegacyWhen = 'age' | 'date' | 'passing' | 'passing_and_age' | 'keepers_decide';

export interface LegacyWish {
  itemTitle: string;
  holderName: string;
  recipients: LegacyRecipient[];
  never: { userId?: string; name: string }[];
  when: LegacyWhen;
  age?: number;
  date?: string;
  restsWithMe: boolean;
  message: string;
  gender: Gender;
  keeperIds: string[];
  createdAt: string;
}

export interface WishRow {
  id: string; org_id: string; item_id: string; holder_id: string; item_version: number; threshold: number;
  key_check: string; nonce: string; wish_ct: string; holder_wish_key: string; status: string; created_at: string; closed_at: string | null;
}
export interface KeeperRow { wish_id: string; keeper_id: string; sealed_share: string; sealed_wish_key: string }
export interface ApprovalRow { wish_id: string; keeper_id: string; recipient_id: string; sealed_share: string; approved_at: string; withdrawn_at: string | null }

export interface LegacyView {
  row: WishRow;
  wish: LegacyWish | null; // null when this device cannot read the wishes (recipients only see that it is ready)
  approvals: ApprovalRow[];
  myRole: 'holder' | 'keeper' | 'recipient';
  myKeeperRow?: KeeperRow;
}

const wishAd = (wishId: string) => `vc-legacy|${wishId}`;
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const WHEN_TEXT: Record<LegacyWhen, string> = {
  age: 'When they reach a set age',
  date: 'On or after a set date',
  passing: 'After I pass away',
  passing_and_age: 'After I pass away, and once they reach a set age',
  keepers_decide: 'When my keepers agree the time is right',
};

export function describeWhen(w: Pick<LegacyWish, 'when' | 'age' | 'date'>): string {
  if (w.when === 'age') return `When they reach ${w.age ?? 18}`;
  if (w.when === 'date') return `On or after ${w.date ? new Date(w.date).toLocaleDateString('en-AU', { dateStyle: 'long' }) : 'a set date'}`;
  if (w.when === 'passing_and_age') return `After I pass away, once they are ${w.age ?? 18} or older`;
  return WHEN_TEXT[w.when];
}

/** Holder: make a legacy wish for an item. Keepers are chosen from the community, usually Cultural Authorities and Recovery Keepers. */
export async function createWish(args: {
  orgId: string; itemId: string; version: number; wish: LegacyWish; keeperIds: string[]; threshold: number;
  me: c.IdentityKeys; myId: string; dir: Directory;
}): Promise<string> {
  const { orgId, itemId, version, wish, keeperIds, threshold, me, myId, dir } = args;
  if (keeperIds.length < 2) throw new Error('Choose at least two Legacy Keepers.');
  if (threshold < 2 || threshold > keeperIds.length) throw new Error('The number of keepers who must agree has to be between 2 and the number of keepers.');
  if (keeperIds.includes(myId)) throw new Error('You cannot be your own Legacy Keeper.');
  const neverIds = new Set(wish.never.map((n) => n.userId).filter(Boolean));
  if (keeperIds.some((k) => neverIds.has(k))) throw new Error('Someone you do not want to receive this cannot be one of its keepers.');
  const encPk = new Map(dir.members.map((m) => [m.user_id, m.enc_pk]));
  for (const k of keeperIds) if (!encPk.get(k)) throw new Error('One of the keepers has not finished setting up.');

  const itemKey = await myItemKey(itemId, version, me, myId);
  const shares = split(itemKey, keeperIds.length, threshold, rand);
  const wishKey = await c.randomKey();
  const id = crypto.randomUUID();
  const box = await c.encryptJson(wishKey, { ...wish, keeperIds }, wishAd(id));
  const sb = supabase();
  const w = await sb.from('legacy_wishes').insert({
    id, org_id: orgId, item_id: itemId, holder_id: myId, item_version: version, threshold,
    key_check: await c.hashHex(itemKey), nonce: box.nonce, wish_ct: box.ct, holder_wish_key: await c.seal(wishKey, me.encPk),
  });
  if (w.error) throw w.error;
  const rows = [];
  for (let i = 0; i < keeperIds.length; i++) {
    const pk = encPk.get(keeperIds[i])!;
    rows.push({ wish_id: id, keeper_id: keeperIds[i], sealed_share: await c.seal(shares[i], pk), sealed_wish_key: await c.seal(wishKey, pk) });
  }
  const k = await sb.from('legacy_keepers').insert(rows);
  if (k.error) throw k.error;
  return id;
}

/** Everything about legacy wishes this person can see, with the wishes decrypted on this device where allowed. */
export async function loadLegacy(me: c.IdentityKeys, myId: string, orgId: string): Promise<LegacyView[]> {
  const sb = supabase();
  const w = await sb.from('legacy_wishes').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (w.error) throw w.error;
  const wishes = (w.data ?? []) as WishRow[];
  if (!wishes.length) return [];
  const ids = wishes.map((x) => x.id);
  const [k, a] = await Promise.all([
    sb.from('legacy_keepers').select('*').in('wish_id', ids).eq('keeper_id', myId),
    sb.from('legacy_approvals').select('*').in('wish_id', ids),
  ]);
  if (k.error) throw k.error;
  if (a.error) throw a.error;
  const out: LegacyView[] = [];
  for (const row of wishes) {
    const myKeeperRow = (k.data as KeeperRow[]).find((x) => x.wish_id === row.id);
    const role: LegacyView['myRole'] = row.holder_id === myId ? 'holder' : myKeeperRow ? 'keeper' : 'recipient';
    let wish: LegacyWish | null = null;
    try {
      const sealed = role === 'holder' ? row.holder_wish_key : myKeeperRow?.sealed_wish_key;
      if (sealed) wish = await c.decryptJson<LegacyWish>(await c.unseal(sealed, me), { nonce: row.nonce, ct: row.wish_ct }, wishAd(row.id));
    } catch { wish = null; }
    out.push({ row, wish, approvals: (a.data as ApprovalRow[]).filter((x) => x.wish_id === row.id), myRole: role, myKeeperRow });
  }
  return out;
}

/** Keeper: agree to release to one person. This device re-seals its share to them. Nothing else leaves the device. */
export async function approveRelease(view: LegacyView, recipientId: string, dir: Directory, me: c.IdentityKeys, myId: string) {
  if (!view.myKeeperRow) throw new Error('You are not a keeper for this.');
  if (view.wish?.never.some((n) => n.userId === recipientId)) throw new Error('The holder asked that this person never receive it.');
  const pk = dir.members.find((m) => m.user_id === recipientId)?.enc_pk;
  if (!pk) throw new Error('That person has not finished setting up yet.');
  const share = await c.unseal(view.myKeeperRow.sealed_share, me);
  const { error } = await supabase().from('legacy_approvals').insert({
    wish_id: view.row.id, keeper_id: myId, recipient_id: recipientId, sealed_share: await c.seal(share, pk),
  });
  if (error) throw error;
}

export async function withdrawApproval(wishId: string, myId: string, recipientId: string) {
  const { error } = await supabase().from('legacy_approvals').update({ withdrawn_at: new Date().toISOString() }).eq('wish_id', wishId).eq('keeper_id', myId).eq('recipient_id', recipientId).is('withdrawn_at', null);
  if (error) throw error;
}

export async function closeWish(wishId: string, status: 'revoked' | 'replaced' | 'fulfilled') {
  const { error } = await supabase().from('legacy_wishes').update({ status, closed_at: new Date().toISOString() }).eq('id', wishId);
  if (error) throw error;
}

/** Recipient: once enough keepers agree, join their shares on this device and keep the key. */
export async function receive(view: LegacyView, me: c.IdentityKeys, myId: string) {
  const mine = view.approvals.filter((a) => a.recipient_id === myId && !a.withdrawn_at);
  if (mine.length < view.row.threshold) throw new Error(`Waiting for ${view.row.threshold - mine.length} more keeper(s).`);
  const shares = [];
  for (const a of mine) shares.push(await c.unseal(a.sealed_share, me));
  const key = combine(shares);
  if ((await c.hashHex(key)) !== view.row.key_check) throw new Error('The keepers’ parts did not join into the right key. Ask them to check.');
  const { error } = await supabase().from('item_keys').insert({
    item_id: view.row.item_id, version: view.row.item_version, recipient_id: myId, sealed_key: await c.seal(key, me.encPk),
  });
  if (error) throw error;
}

/** Holder: after the item gets a new version (new key), make a fresh wish with the same details and retire the old one. */
export async function refreshWish(view: LegacyView, version: number, me: c.IdentityKeys, myId: string, dir: Directory) {
  if (!view.wish) throw new Error('Cannot read the wishes on this device.');
  const keeperIds = view.wish.keeperIds;
  await createWish({ orgId: view.row.org_id, itemId: view.row.item_id, version, wish: view.wish, keeperIds, threshold: view.row.threshold, me, myId, dir });
  await closeWish(view.row.id, 'replaced');
}
