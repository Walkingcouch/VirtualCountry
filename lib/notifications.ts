/**
 * In-app notifications, worked out on this device from what the person can already see.
 * Nothing about content is sent anywhere. Email and push alerts need a server-side sender and are in the build plan.
 */
import type { IdentityKeys } from './crypto';
import type { Directory } from './access';
import type { MyOrg } from './data';
import { conversationActivity, listConversations, loadReleases } from './data';
import { loadLegacy } from './legacy';

export interface Note { id: string; kind: 'message' | 'member' | 'release' | 'ca' | 'legacy' | 'security'; text: string; href: string; at?: string }

const readKey = (uid: string) => `vc-read-${uid}`;
export function readMap(uid: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(readKey(uid)) || '{}'); } catch { return {}; }
}
export function markRead(uid: string, convId: string, at = new Date().toISOString()) {
  try {
    const m = readMap(uid);
    m[convId] = at;
    localStorage.setItem(readKey(uid), JSON.stringify(m));
    window.dispatchEvent(new Event('vc-read'));
  } catch { /* storage unavailable: unread markers reset on this device */ }
}

export async function loadNotifications(args: {
  org: MyOrg; dir: Directory; userId: string; keys: IdentityKeys; cas: Set<string>; caPending: Map<string, string[]>;
  keyAlerts: string[]; openItemIds: Set<string>; itemVersions: Map<string, number>; nameOf: (id: string) => string;
}): Promise<Note[]> {
  const { org, dir, userId, keys, cas, caPending, keyAlerts, openItemIds, itemVersions, nameOf } = args;
  const out: Note[] = [];
  const isCa = cas.has(userId);

  const [convs, activity] = await Promise.all([listConversations(), conversationActivity()]);
  const read = readMap(userId);
  for (const c of convs) {
    const a = activity.get(c.id);
    if (a && a.sender !== userId && (!read[c.id] || read[c.id] < a.at)) {
      out.push({ id: `msg-${c.id}`, kind: 'message', text: `New message in ${c.kind === 'bridge' ? 'the bridge ' : ''}${c.title}`, href: `/messages?c=${c.id}`, at: a.at });
    }
  }

  if (org.is_admin) {
    for (const m of dir.members.filter((x) => x.status === 'pending')) {
      out.push({ id: `join-${m.user_id}`, kind: 'member', text: `${m.display_name} asked to join`, href: '/community' });
    }
  }

  if (isCa) {
    const rel = await loadReleases(org.id);
    for (const r of rel.filter((x) => x.status === 'pending')) {
      out.push({ id: `rel-${r.id}`, kind: 'release', text: `Public summary waiting for sign-off: ${r.title}`, href: '/releases', at: r.created_at });
    }
    caPending.forEach((issuers, subject) => {
      if (!issuers.includes(userId)) out.push({ id: `ca-${subject}`, kind: 'ca', text: `${nameOf(subject)} has been put forward as a Cultural Authority. A second Cultural Authority needs to agree.`, href: '/community' });
    });
  }

  try {
    const legacy = await loadLegacy(keys, userId, org.id);
    for (const v of legacy.filter((x) => x.row.status === 'active')) {
      const title = v.wish?.itemTitle ?? 'an item';
      if (v.myRole === 'holder' && (itemVersions.get(v.row.item_id) ?? v.row.item_version) > v.row.item_version) {
        out.push({ id: `lg-refresh-${v.row.id}`, kind: 'legacy', text: `You changed "${title}". Refresh your legacy wish so it still works.`, href: `/stories/${v.row.item_id}` });
      }
      if (v.myRole === 'keeper') {
        const others = v.approvals.filter((a) => !a.withdrawn_at && a.keeper_id !== userId);
        const pendingFor = Array.from(new Set(others.map((a) => a.recipient_id))).filter((r) => !v.approvals.some((a) => a.keeper_id === userId && a.recipient_id === r && !a.withdrawn_at));
        for (const r of pendingFor) out.push({ id: `lg-k-${v.row.id}-${r}`, kind: 'legacy', text: `Another keeper agreed to pass on "${title}" to ${nameOf(r)}. Your decision is needed.`, href: '/legacy' });
      }
      const mine = v.approvals.filter((a) => a.recipient_id === userId && !a.withdrawn_at);
      if (mine.length >= v.row.threshold && !openItemIds.has(v.row.item_id)) {
        out.push({ id: `lg-r-${v.row.id}`, kind: 'legacy', text: 'Knowledge has been passed on to you. Open Legacy to receive it.', href: '/legacy' });
      }
    }
  } catch { /* legacy tables unavailable */ }

  for (const n of keyAlerts) out.push({ id: `key-${n}`, kind: 'security', text: `Security key changed for ${n}. Check with them if you are not sure.`, href: '/community' });
  return out;
}
