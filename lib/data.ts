/**
 * Data access. Everything is fetched as ciphertext and decrypted here, on the device.
 */
import * as c from './crypto';
import { supabase } from './supabase';
import { eligibleRecipients, type Directory } from './access';
import { itemAd, msgAd, type Attestation, type Group, type ItemPayload, type Member, type MediaRef } from './model';

/* =========================================================
   Organisations and directory
   ========================================================= */
export interface MyOrg { id: string; name: string; kind: string; founding_ca: string | null; storage_option: string; is_admin: boolean; content_member: boolean; status: string }

export async function myOrgs(userId: string): Promise<MyOrg[]> {
  const sb = supabase();
  const { data, error } = await sb.from('org_members').select('org_id, status, is_admin, content_member, orgs(id, name, kind, founding_ca, storage_option)').eq('user_id', userId);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ ...r.orgs, is_admin: r.is_admin, content_member: r.content_member, status: r.status }));
}

export async function allOrgs(): Promise<{ id: string; name: string; kind: string }[]> {
  const { data, error } = await supabase().from('orgs').select('id, name, kind').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function loadDirectory(org: MyOrg): Promise<Directory> {
  const sb = supabase();
  const [m, a, g, gm] = await Promise.all([
    sb.rpc('org_directory', { p_org: org.id }),
    sb.from('attestations').select('*').eq('org_id', org.id),
    sb.from('groups').select('*').eq('org_id', org.id).order('name'),
    sb.from('group_members').select('group_id, user_id'),
  ]);
  for (const r of [m, a, g, gm]) if (r.error) throw r.error;
  const groups: Group[] = (g.data ?? []).map((x) => ({ ...x, members: (gm.data ?? []).filter((y) => y.group_id === x.id).map((y) => y.user_id) }));
  return { orgId: org.id, foundingCa: org.founding_ca, members: (m.data ?? []) as Member[], attestations: (a.data ?? []) as Attestation[], groups };
}

/* =========================================================
   Items
   ========================================================= */
export interface ItemRow { id: string; org_id: string; holder_id: string; current_version: number; paused: boolean; sacred: boolean; created_at: string }
export interface OpenItem {
  row: ItemRow;
  payload: ItemPayload;
  recipients: string[];
  signatureOk: boolean;
  version: number;
  ciphertextPreview: string;
}

export async function loadItems(orgId: string, me: c.IdentityKeys, myId: string, dir: Directory): Promise<{ items: OpenItem[]; failures: number }> {
  const sb = supabase();
  const { data: rows, error } = await sb.from('items').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows?.length) return { items: [], failures: 0 };
  const ids = rows.map((r) => r.id);
  const [vers, keys] = await Promise.all([
    sb.from('item_versions').select('*').in('item_id', ids),
    sb.from('item_keys').select('item_id, version, sealed_key').in('item_id', ids).eq('recipient_id', myId).neq('sealed_key', 'revoked'),
  ]);
  if (vers.error) throw vers.error;
  if (keys.error) throw keys.error;
  const signPk = new Map(dir.members.map((m) => [m.user_id, m.sign_pk]));
  const out: OpenItem[] = [];
  let failures = 0;
  for (const row of rows as ItemRow[]) {
    const v = vers.data!.find((x) => x.item_id === row.id && x.version === row.current_version);
    const k = keys.data!.find((x) => x.item_id === row.id && x.version === row.current_version);
    if (!v || !k) continue;
    try {
      const key = await c.unseal(k.sealed_key, me);
      const payload = await c.decryptJson<ItemPayload>(key, { nonce: v.nonce, ct: v.ciphertext }, itemAd(row.id, v.version));
      const ctHash = await c.hashHex(v.ciphertext);
      const rHash = await c.recipientsHash(v.recipients);
      const pk = signPk.get(v.author_id);
      const signatureOk = !!pk && ctHash === v.ct_hash && rHash === v.recipients_hash
        && (await c.verify(v.author_sig, c.itemMessage(row.id, v.version, ctHash, rHash), pk));
      out.push({ row, payload, recipients: v.recipients, signatureOk, version: v.version, ciphertextPreview: v.ciphertext.slice(0, 220) });
    } catch {
      failures++;
    }
  }
  return { items: out, failures };
}

/** Encrypt, seal and sign a version, then save it in one database transaction. */
export async function saveItemVersion(args: {
  itemId: string; orgId: string; version: number; payload: ItemPayload; me: c.IdentityKeys; myId: string; dir: Directory; paused: boolean;
}): Promise<string[]> {
  const { itemId, orgId, version, payload, me, myId, dir, paused } = args;
  const recipients = await eligibleRecipients(dir, myId, payload, paused);
  const key = await c.randomKey();
  const box = await c.encryptJson(key, payload, itemAd(itemId, version));
  const ctHash = await c.hashHex(box.ct);
  const rHash = await c.recipientsHash(recipients);
  const sig = await c.sign(c.itemMessage(itemId, version, ctHash, rHash), me.signSk);
  const encPk = new Map(dir.members.map((m) => [m.user_id, m.enc_pk]));
  encPk.set(myId, me.encPk);
  const keys = [];
  for (const r of recipients) {
    const pk = encPk.get(r);
    if (!pk) throw new Error('A recipient has no public key yet');
    keys.push({ recipient_id: r, sealed_key: await c.seal(key, pk) });
  }
  const { error } = await supabase().rpc('save_item', {
    p_item_id: itemId, p_org: orgId, p_version: version, p_nonce: box.nonce, p_ciphertext: box.ct, p_ct_hash: ctHash,
    p_recipients: recipients, p_recipients_hash: rHash, p_sig: sig, p_keys: keys, p_paused: paused, p_sacred: payload.restrictions.sacred,
  });
  if (error) throw error;
  return recipients;
}

/** Encrypt a file with its own key and upload the ciphertext. */
export async function uploadMedia(orgId: string, itemId: string, file: Blob, name: string): Promise<MediaRef> {
  if (file.size > 6 * 1024 * 1024) throw new Error('Files over 6 MB are not supported in the demo');
  const key = await c.randomKey();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const box = await c.encrypt(key, bytes, 'vc-media');
  const id = crypto.randomUUID();
  const path = `${orgId}/${itemId}/${id}`;
  const cipher = await c.unb64(box.ct);
  const { error } = await supabase().storage.from('media').upload(path, new Blob([cipher as BlobPart], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
  if (error) throw error;
  return { id, path, name, mime: file.type || 'application/octet-stream', nonce: box.nonce, key: await c.b64(key), size: file.size };
}

export async function openMedia(ref: MediaRef): Promise<string> {
  const { data, error } = await supabase().storage.from('media').download(ref.path);
  if (error) throw error;
  const ct = new Uint8Array(await data.arrayBuffer());
  const plain = await c.decrypt(await c.unb64(ref.key), { nonce: ref.nonce, ct: await c.b64(ct) }, 'vc-media');
  return URL.createObjectURL(new Blob([plain as BlobPart], { type: ref.mime }));
}

/* =========================================================
   Releases
   ========================================================= */
export interface Release {
  id: string; org_id: string; source_item_id: string; title: string; summary: string; place_label: string;
  blur_x: number | null; blur_y: number | null; labels: string[]; status: string; created_by: string; created_at: string;
  signer_id: string | null; sig: string | null; published_at: string | null; withdrawn_at: string | null;
}

export async function verifyRelease(r: Release, signerSignPk: string | null | undefined): Promise<boolean> {
  if (!r.sig || !signerSignPk) return false;
  const h = await c.releaseBodyHash(r.title, r.summary, r.place_label, r.blur_x, r.blur_y);
  return c.verify(r.sig, c.releaseMessage(r.id, h), signerSignPk);
}

export async function loadReleases(orgId: string): Promise<Release[]> {
  const { data, error } = await supabase().from('releases').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Release[];
}

export async function loadPublicReleases(): Promise<(Release & { signer_name?: string; signer_pk?: string })[]> {
  const sb = supabase();
  const { data, error } = await sb.from('releases').select('*').eq('status', 'published').order('published_at', { ascending: false });
  if (error) throw error;
  const rels = (data ?? []) as Release[];
  const signerIds = Array.from(new Set(rels.map((r) => r.signer_id).filter(Boolean))) as string[];
  const [pk, pr] = await Promise.all([
    signerIds.length ? sb.from('public_keys').select('user_id, sign_pk').in('user_id', signerIds) : Promise.resolve({ data: [] as { user_id: string; sign_pk: string }[] }),
    signerIds.length ? sb.from('profiles').select('id, display_name').in('id', signerIds) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);
  return rels.map((r) => ({
    ...r,
    signer_pk: pk.data?.find((x) => x.user_id === r.signer_id)?.sign_pk,
    signer_name: pr.data?.find((x) => x.id === r.signer_id)?.display_name,
  }));
}

export async function draftRelease(args: { orgId: string; itemId: string; title: string; summary: string; placeLabel: string; bx: number | null; by: number | null; labels: string[]; myId: string }) {
  const { error } = await supabase().from('releases').insert({
    org_id: args.orgId, source_item_id: args.itemId, title: args.title, summary: args.summary, place_label: args.placeLabel,
    blur_x: args.bx, blur_y: args.by, labels: args.labels, status: 'pending', created_by: args.myId,
  });
  if (error) throw error;
}

export async function signRelease(r: Release, me: c.IdentityKeys) {
  const h = await c.releaseBodyHash(r.title, r.summary, r.place_label, r.blur_x, r.blur_y);
  const sig = await c.sign(c.releaseMessage(r.id, h), me.signSk);
  const { error } = await supabase().rpc('sign_release', { p_release: r.id, p_sig: sig });
  if (error) throw error;
}

/** Generalise a map location to the centre of its grid cell (D7: public locations are blurred). */
export function blurPoint(x: number, y: number, percent: number) {
  const cell = Math.max(20, Math.round((1000 * percent) / 100));
  return { bx: Math.floor(x / cell) * cell + cell / 2, by: Math.floor(y / cell) * cell + cell / 2 };
}

/* =========================================================
   Messaging
   ========================================================= */
export interface Conversation { id: string; org_id: string | null; kind: 'group' | 'direct' | 'bridge'; title: string; created_by: string; key_version: number; created_at: string }
export interface ChatMessage { id: string; sender_id: string; created_at: string; text: string; verified: boolean }

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase().from('conversations').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function conversationMembers(convId: string): Promise<string[]> {
  const { data, error } = await supabase().from('conversation_members').select('user_id').eq('conversation_id', convId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

async function conversationKey(convId: string, version: number, me: c.IdentityKeys, myId: string) {
  const { data, error } = await supabase().from('conversation_keys').select('sealed_key').eq('conversation_id', convId).eq('key_version', version).eq('recipient_id', myId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No key for this conversation');
  return c.unseal(data.sealed_key, me);
}

export async function loadMessages(conv: Conversation, me: c.IdentityKeys, myId: string, signKeys: Map<string, string>): Promise<ChatMessage[]> {
  const { data, error } = await supabase().from('messages').select('*').eq('conversation_id', conv.id).order('created_at');
  if (error) throw error;
  const keys = new Map<number, Uint8Array>();
  const out: ChatMessage[] = [];
  for (const m of data ?? []) {
    try {
      if (!keys.has(m.key_version)) keys.set(m.key_version, await conversationKey(conv.id, m.key_version, me, myId));
      const body = await c.decryptJson<{ text: string }>(keys.get(m.key_version)!, { nonce: m.nonce, ct: m.ciphertext }, msgAd(conv.id));
      const pk = signKeys.get(m.sender_id);
      const verified = !!pk && (await c.verify(m.sig, c.messageMessage(conv.id, m.key_version, await c.hashHex(m.ciphertext)), pk));
      out.push({ id: m.id, sender_id: m.sender_id, created_at: m.created_at, text: body.text, verified });
    } catch {
      out.push({ id: m.id, sender_id: m.sender_id, created_at: m.created_at, text: '[cannot be opened on this device]', verified: false });
    }
  }
  return out;
}

export async function sendMessage(conv: Conversation, text: string, me: c.IdentityKeys, myId: string) {
  const key = await conversationKey(conv.id, conv.key_version, me, myId);
  const box = await c.encryptJson(key, { text }, msgAd(conv.id));
  const sig = await c.sign(c.messageMessage(conv.id, conv.key_version, await c.hashHex(box.ct)), me.signSk);
  const { error } = await supabase().from('messages').insert({ conversation_id: conv.id, sender_id: myId, key_version: conv.key_version, nonce: box.nonce, ciphertext: box.ct, sig });
  if (error) throw error;
}

/** Start a chat with members of my own organisation. The database refuses anyone from another organisation. */
export async function createConversation(orgId: string, title: string, memberIds: string[], dir: Directory, me: c.IdentityKeys, myId: string) {
  const sb = supabase();
  const all = Array.from(new Set([myId, ...memberIds]));
  const encPk = new Map(dir.members.map((m) => [m.user_id, m.enc_pk]));
  encPk.set(myId, me.encPk);
  const missing = all.filter((u) => !encPk.get(u));
  if (missing.length) {
    const names = missing.map((u) => dir.members.find((m) => m.user_id === u)?.display_name ?? 'someone').join(', ');
    throw new Error(`${names} has not finished setting up, so a locked chat cannot be started with them yet.`);
  }
  const id = crypto.randomUUID();
  const kind = all.length === 2 ? 'direct' : 'group';
  const others = all.filter((u) => u !== myId).map((u) => dir.members.find((m) => m.user_id === u)?.display_name?.split(' (')[0] ?? 'Member');
  const name = title.trim() || (kind === 'direct' ? others[0] : others.join(', '));
  let r = await sb.from('conversations').insert({ id, org_id: orgId, kind, title: name, created_by: myId });
  if (r.error) throw r.error;
  r = await sb.from('conversation_members').insert(all.map((u) => ({ conversation_id: id, user_id: u })));
  if (r.error) throw r.error;
  const key = await c.randomKey();
  const rows = [];
  for (const u of all) rows.push({ conversation_id: id, key_version: 1, recipient_id: u, sealed_key: await c.seal(key, encPk.get(u)!) });
  r = await sb.from('conversation_keys').insert(rows);
  if (r.error) throw r.error;
  return id;
}

/** Latest message time and sender per conversation, for unread markers. Message content is never read here. */
export async function conversationActivity(): Promise<Map<string, { at: string; sender: string; count: number }>> {
  const { data, error } = await supabase().from('messages').select('conversation_id, created_at, sender_id').order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const out = new Map<string, { at: string; sender: string; count: number }>();
  for (const m of data ?? []) {
    const cur = out.get(m.conversation_id);
    if (!cur) out.set(m.conversation_id, { at: m.created_at, sender: m.sender_id, count: 1 });
    else cur.count++;
  }
  return out;
}

/** People in a set of conversations, so direct chats can be named after the other person. */
export async function membersOf(convIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!convIds.length) return out;
  const { data, error } = await supabase().from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds);
  if (error) throw error;
  for (const r of data ?? []) out.set(r.conversation_id, [...(out.get(r.conversation_id) ?? []), r.user_id]);
  return out;
}

export interface BridgeInfo { bridge_id: string; other_org: string; participants: string[]; message_count: number; last_message_at: string | null; status: string; created_at: string }
export async function listBridges(orgId: string): Promise<BridgeInfo[]> {
  const { data, error } = await supabase().rpc('list_bridges', { p_org: orgId });
  if (error) throw error;
  return (data ?? []) as BridgeInfo[];
}

/* =========================================================
   Governance log
   ========================================================= */
export interface AuditRow { id: number; actor_id: string | null; action: string; target_type: string; target_id: string; at: string; hash: string; prev_hash: string; detail_hash: string | null; detail?: Record<string, unknown> }
/** Everyone in the community sees the actions. Administrators and Cultural Authorities also see the detail (who, what changed). */
export async function loadAudit(orgId: string): Promise<AuditRow[]> {
  const sb = supabase();
  const { data, error } = await sb.from('audit_log').select('id, actor_id, action, target_type, target_id, at, hash, prev_hash, detail_hash').eq('org_id', orgId).order('id', { ascending: false }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as AuditRow[];
  const ids = rows.filter((r) => r.detail_hash).map((r) => r.id);
  if (ids.length) {
    const d = await sb.from('audit_details').select('audit_id, detail').in('audit_id', ids);
    if (!d.error) for (const x of d.data ?? []) { const r = rows.find((y) => y.id === x.audit_id); if (r) r.detail = x.detail; }
  }
  return rows;
}
export async function verifyChain(orgId: string): Promise<{ ok: boolean; entries: number; head: string }> {
  const { data, error } = await supabase().rpc('verify_audit_chain', { p_org: orgId });
  if (error) throw error;
  return (data as { ok: boolean; entries: number; head: string }[])[0];
}

export async function issueAttestation(orgId: string, subjectId: string, claim: Attestation['claim'], me: c.IdentityKeys, myId: string) {
  const issued_at = new Date().toISOString();
  const sig = await c.sign(c.attestationMessage(orgId, subjectId, claim, issued_at), me.signSk);
  const { error } = await supabase().from('attestations').insert({ org_id: orgId, subject_id: subjectId, claim, issuer_id: myId, issued_at, sig });
  if (error) throw error;
}

/** Remove a confirmed standing or role. Any Cultural Authority can do this, and it is logged with who removed it. */
export async function revokeAttestations(orgId: string, subjectId: string, claim: Attestation['claim']) {
  const { error } = await supabase().from('attestations').update({ revoked_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('subject_id', subjectId).eq('claim', claim).is('revoked_at', null);
  if (error) throw error;
}

/** The item key this device holds for the current version (holder or recipient). */
export async function myItemKey(itemId: string, version: number, me: c.IdentityKeys, myId: string): Promise<Uint8Array> {
  const { data, error } = await supabase().from('item_keys').select('sealed_key').eq('item_id', itemId).eq('version', version).eq('recipient_id', myId).neq('sealed_key', 'revoked').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This device does not hold a key for this item');
  return c.unseal(data.sealed_key, me);
}
