/**
 * AI Guide, help mode (Part D, D13; Part F, F10).
 * The only source of answers is the fixed help text below. It has no route to stories, names, places or keys.
 * Before a question is answered, it is screened on the device against material the person must not send.
 * In the demo, answers come from this help text on the device. Nothing is sent to any AI service.
 */

export type Area = 'home' | 'record' | 'stories' | 'story' | 'map' | 'messages' | 'releases' | 'community' | 'me' | 'legacy' | 'notifications' | 'general';

interface Entry { q: string; a: string; keys: string[] }

const HELP: Record<Area, Entry[]> = {
  general: [
    { q: 'Who can read my stories?', a: 'Only the people you choose. Your story is locked on your phone before it is saved. Each person you share with gets their own copy of the key. The administrator, First Geospatial and the server never get a key, so they cannot read it.', keys: ['who', 'read', 'see', 'private', 'admin', 'server'] },
    { q: 'What happens if I lose my phone?', a: 'Your stories are not on the phone in readable form. Sign in on a new phone and use your recovery card. If you have lost the card too, ask your Community Administrator for in-person recovery with two Recovery Keepers.', keys: ['lose', 'lost', 'phone', 'recovery', 'card', 'forgot'] },
    { q: 'What does Lock do?', a: 'Lock closes your private space on this device straight away, like locking the door when you leave a room. Use it on a shared phone or computer. Nothing is deleted. Type your passphrase to open it again. The app also locks itself after a few minutes without use.', keys: ['lock', 'locked', 'unlock', 'passphrase', 'why'] },
    { q: 'Where is my data stored?', a: 'Your community chooses: an Australian-owned data centre, a local server at your community, or both. In this demo, invented data is stored in a cloud sandbox.', keys: ['where', 'stored', 'store', 'server', 'cloud', 'australia'] },
  ],
  home: [
    { q: 'Where do I start?', a: 'Tap Record to save something new, Stories to see what has been shared with you, or Map to find things by place.', keys: ['start', 'begin', 'first'] },
  ],
  record: [
    { q: 'How do I record a story?', a: 'Give it a short title, type or record your story, choose a place on the map if you want, then choose who can see it. Answer the consent questions and tap Save. It is locked on your phone before it is sent.', keys: ['record', 'save', 'new', 'how', 'add'] },
    { q: "What does women's knowledge do?", a: "Only people a Cultural Authority has confirmed as women receive the key. Others never get it, so they cannot open it even if they try.", keys: ['women', 'woman', 'men', 'gender', 'lock'] },
    { q: 'What is the consent section?', a: 'It records who agreed and for which uses: family, community, school, research, government summary, public and the AI helper. You can change it later.', keys: ['consent', 'agree', 'uses', 'permission'] },
    { q: 'What does the sacred-site flag do?', a: 'Items with this flag can never be made public, shared with partners or used by the AI helper.', keys: ['sacred', 'site', 'flag'] },
  ],
  stories: [
    { q: 'Why can I not see some stories?', a: 'You only see stories you hold a key for. If you are not in the group, standing or community a story was shared with, it does not appear for you.', keys: ['why', 'cannot', 'missing', 'see'] },
    { q: 'Can I change who can open something later?', a: 'Yes, if you are the holder. Open it and tap Change who can open this. It is locked again with a new key, the new people receive keys, and anyone removed loses access. The change is recorded in the governance log.', keys: ['change', 'protection', 'access', 'later', 'edit'] },
    { q: 'What does "Update access" mean?', a: 'When people join or leave, the holder updates access so new members get keys and removed members lose them.', keys: ['update', 'access', 'rekey', 'join', 'leave'] },
  ],
  story: [
    { q: 'How do I pause a story for sorry business?', a: 'If you hold the story, tap Pause. It is re-locked under a new key that only you hold. Nobody else can open it until you lift the pause.', keys: ['pause', 'sorry', 'business', 'passed'] },
    { q: 'How do I make a public summary?', a: 'If you hold the story and consent includes public use, tap Prepare public summary. A Cultural Authority must sign it before it appears publicly. The location is blurred.', keys: ['public', 'summary', 'release', 'share'] },
    { q: 'What does "signature checked" mean?', a: "The app checked the holder's digital signature, so the story has not been changed by anyone else.", keys: ['signature', 'signed', 'checked', 'tamper'] },
  ],
  map: [
    { q: 'What is this map?', a: 'Demo Country is an invented map for the demo. A real community can use a terrain map, satellite imagery, or its own painted map of Country.', keys: ['map', 'what', 'painted'] },
    { q: 'Why are some places missing?', a: 'The map only shows stories you can open, and only if the holder chose to add a place.', keys: ['missing', 'pins', 'places'] },
  ],
  messages: [
    { q: 'Who can I message?', a: 'Anyone in your own organisation. Messages are locked end to end. To reach another organisation, ask your administrator. They use a bridge that every member can see.', keys: ['who', 'message', 'chat', 'talk'] },
    { q: 'What is a bridge?', a: 'The only channel between two organisations. Only administrators are in it, and members of both organisations can see that it exists and when it is used.', keys: ['bridge', 'other', 'organisation', 'outside'] },
  ],
  releases: [
    { q: 'Who can sign a release?', a: 'Only a Cultural Authority of the same community. Their digital signature is checked before the release is shown publicly.', keys: ['sign', 'who', 'authority', 'approve'] },
    { q: 'Can a release be taken back?', a: 'Yes. The holder or a Cultural Authority can withdraw it at any time.', keys: ['withdraw', 'remove', 'take', 'back'] },
  ],
  community: [
    { q: 'How do I confirm someone as a woman or man?', a: 'Only Cultural Authorities can do this. Their confirmation is digitally signed, so nobody else can fake it.', keys: ['confirm', 'women', 'men', 'standing', 'attest'] },
    { q: 'What is the governance log?', a: 'A record of actions, such as members approved or stories paused, linked in a chain so any change to it can be detected. It never contains content.', keys: ['log', 'governance', 'audit', 'chain'] },
  ],
  legacy: [
    { q: 'What is legacy access?', a: 'A way to pass knowledge on later, for example to children when they are grown, or to great-grandchildren not yet born. You choose who, who never, and when. Your Legacy Keepers each hold one part of the key. Nobody can open it until enough keepers agree your wishes are met.', keys: ['legacy', 'pass', 'future', 'children', 'grandchildren', 'what'] },
    { q: 'What if nobody meets my wishes?', a: 'Then nobody can ever open it. The knowledge rests with you. The keepers only hold parts of a key, and parts alone open nothing.', keys: ['nobody', 'rest', 'never', 'die', 'with me'] },
    { q: 'Can I keep it from certain people?', a: 'Yes. Name them under "Never to". Your keepers see that list and the app will not let them release to those people. They also cannot be keepers.', keys: ['keep', 'never', 'exclude', 'not', 'trust'] },
    { q: 'Who should be a Legacy Keeper?', a: 'People you trust to honour your wishes after you, often Cultural Authorities or Recovery Keepers. Choose at least two. You also choose how many must agree.', keys: ['keeper', 'who', 'choose', 'trust'] },
    { q: 'Can I change my mind?', a: 'Yes. Open Legacy and cancel the wish at any time. If you change the item itself, refresh the wish so it still works.', keys: ['change', 'cancel', 'mind', 'revoke'] },
  ],
  notifications: [
    { q: 'Can I get notifications by email or on my phone?', a: 'Not yet in the demo. Email and phone alerts are planned. They will only say that something needs you, never what a story says.', keys: ['email', 'push', 'phone', 'alert'] },
  ],
  me: [
    { q: 'What is my safety code?', a: 'Six words made from your security key. Compare them face to face with someone to check you each have the right key.', keys: ['safety', 'code', 'words', 'key'] },
    { q: 'Can I download my data?', a: 'Yes. Tap Download my data to save everything you hold, decrypted, to your own device.', keys: ['download', 'export', 'data', 'leave'] },
  ],
};

export function suggestions(area: Area): string[] {
  return [...(HELP[area] ?? []), ...HELP.general].slice(0, 5).map((e) => e.q);
}

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function answer(area: Area, question: string): string {
  const qn = norm(question);
  const pool = [...(HELP[area] ?? []), ...HELP.general];
  const exact = pool.find((e) => norm(e.q) === qn);
  if (exact) return exact.a;
  let best: Entry | null = null; let score = 0;
  for (const e of pool) {
    const s = e.keys.filter((k) => qn.includes(k)).length;
    if (s > score) { score = s; best = e; }
  }
  return best ? best.a : 'I can only help with how to use this screen and the platform. For cultural questions, please ask the people who hold that knowledge.';
}

export interface DenyEntry { term: string; reason: string }

/** Screen text against the device-only deny-list. Returns the reason if anything matches. */
export function screen(text: string, deny: DenyEntry[]): string | null {
  const t = norm(text);
  if (/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(text)) return 'a map coordinate';
  if (/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/i.test(text)) return 'something that looks like a recovery code';
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return 'an email address';
  if (/(\+?61|0)[2-478](\s?\d){8}/.test(text)) return 'a phone number';
  for (const d of deny) {
    const n = norm(d.term);
    if (n.length >= 4 && t.includes(n)) return d.reason;
  }
  return null;
}
