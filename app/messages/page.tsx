'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { conversationActivity, createConversation, listBridges, listConversations, loadMessages, membersOf, sendMessage, type BridgeInfo, type ChatMessage, type Conversation } from '@/lib/data';
import { markRead, readMap } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type Tab = 'chats' | 'bridges';
const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

export default function Messages() {
  const { keys, userId, org, dir, nameOf } = useSession();
  const [tab, setTab] = useState<Tab>('chats');
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Map<string, string[]>>(new Map());
  const [activity, setActivity] = useState<Map<string, { at: string; sender: string; count: number }>>(new Map());
  const [read, setRead] = useState<Record<string, string>>({});
  const [active, setActive] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [bridges, setBridges] = useState<BridgeInfo[]>([]);
  const [newChat, setNewChat] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [outsider, setOutsider] = useState('');
  const [signKeys, setSignKeys] = useState<Map<string, string>>(new Map());
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const refresh = useCallback(async () => {
    const c = await listConversations();
    setConvs(c);
    const [m, a] = await Promise.all([membersOf(c.map((x) => x.id)), conversationActivity()]);
    setMembers(m);
    setActivity(a);
    if (userId) setRead(readMap(userId));
    if (org) setBridges(await listBridges(org.id));
    const { data } = await supabase().from('public_keys').select('user_id, sign_pk');
    setSignKeys(new Map((data ?? []).map((r) => [r.user_id, r.sign_pk])));
    return c;
  }, [org, userId]);

  const open = useCallback(async (c: Conversation) => {
    if (!keys || !userId) return;
    setErr('');
    setActive(c);
    atBottom.current = true;
    const list = await loadMessages(c, keys, userId, signKeys);
    setMsgs(list);
    markRead(userId, c.id, list.at(-1)?.created_at ?? new Date().toISOString());
    setRead(readMap(userId));
  }, [keys, userId, signKeys]);

  // First load, and open a chat from a notification link (?c=<id>)
  useEffect(() => {
    refresh().then((c) => {
      const id = new URLSearchParams(window.location.search).get('c');
      const target = id ? c.find((x) => x.id === id) : null;
      if (target) { setTab(target.kind === 'bridge' ? 'bridges' : 'chats'); open(target); }
    }).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Check for new messages while a chat is open
  useEffect(() => {
    if (!active || !keys || !userId) return;
    const t = setInterval(async () => {
      try {
        const list = await loadMessages(active, keys, userId, signKeys);
        setMsgs((old) => (old.length === list.length ? old : list));
        markRead(userId, active.id, list.at(-1)?.created_at);
      } catch { /* try again next time */ }
    }, 6000);
    return () => clearInterval(t);
  }, [active, keys, userId, signKeys]);

  // Scroll only inside the message list, and only if the person is already at the bottom
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Lock page scrolling behind the full-screen chat on phones
  useEffect(() => {
    if (!active) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  const send = async () => {
    if (!active || !keys || !userId || !text.trim()) return;
    setErr('');
    try {
      await sendMessage(active, text.trim(), keys, userId);
      setText('');
      atBottom.current = true;
      await open(active);
      await refresh();
    } catch (e) { setErr((e as Error).message); }
  };

  const people = useMemo(() => (dir?.members ?? []).filter((m) => m.status === 'active' && m.user_id !== userId), [dir, userId]);
  const nameFor = useCallback((c: Conversation) => {
    if (c.kind === 'direct') {
      const other = (members.get(c.id) ?? []).find((u) => u !== userId);
      if (other) return nameOf(other).split(' (')[0];
    }
    return c.title || 'Chat';
  }, [members, userId, nameOf]);
  const isUnread = (c: Conversation) => {
    const a = activity.get(c.id);
    return !!a && a.sender !== userId && (!read[c.id] || read[c.id] < a.at);
  };
  const byRecent = (a: Conversation, b: Conversation) => (activity.get(b.id)?.at ?? b.created_at).localeCompare(activity.get(a.id)?.at ?? a.created_at);
  const direct = convs.filter((c) => c.kind === 'direct').sort(byRecent);
  const groups = convs.filter((c) => c.kind === 'group').sort(byRecent);
  const bridgeConvs = convs.filter((c) => c.kind === 'bridge').sort(byRecent);
  const unreadChats = [...direct, ...groups].filter(isUnread).length;
  const unreadBridges = bridgeConvs.filter(isUnread).length;

  const create = async () => {
    if (!keys || !userId || !org || !dir || !pick.length) return;
    setErr(''); setBusy(true);
    try {
      // Re-open an existing direct chat with the same person rather than making a second one
      if (pick.length === 1) {
        const existing = direct.find((c) => (members.get(c.id) ?? []).includes(pick[0]));
        if (existing) { setNewChat(false); setPick([]); setTitle(''); await open(existing); return; }
      }
      const id = await createConversation(org.id, title, pick, dir, keys, userId);
      setNewChat(false); setPick([]); setTitle('');
      const c = await refresh();
      const made = c.find((x) => x.id === id);
      if (made) await open(made);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  // Demonstrates the same-organisation rule: the database refuses a chat with someone outside the organisation.
  const tryOutsider = async () => {
    if (!keys || !userId || !org || !dir) return;
    setOutsider('Trying…');
    const { data } = await supabase().from('public_keys').select('user_id');
    const stranger = (data ?? []).find((p) => !dir.members.some((m) => m.user_id === p.user_id));
    if (!stranger) { setOutsider('There is nobody outside your organisation to test with.'); return; }
    try {
      const id = crypto.randomUUID();
      const r1 = await supabase().from('conversations').insert({ id, org_id: org.id, kind: 'direct', title: 'Test', created_by: userId });
      if (r1.error) throw r1.error;
      const r2 = await supabase().from('conversation_members').insert([{ conversation_id: id, user_id: userId }, { conversation_id: id, user_id: stranger.user_id }]);
      if (r2.error) throw r2.error;
      setOutsider('Unexpected: the database allowed it. Please report this.');
    } catch {
      setOutsider('Refused by the database. Members can only message people in their own organisation. Other organisations are reached through administrators on a bridge.');
    }
    await refresh();
  };

  const Row = ({ c, sub }: { c: Conversation; sub: string }) => {
    const unread = isUnread(c);
    const a = activity.get(c.id);
    return (
      <button onClick={() => open(c)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-sand ${active?.id === c.id ? 'bg-sand' : ''}`}>
        <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-head font-bold ${c.kind === 'bridge' ? 'bg-gold/30 text-ink' : 'bg-ink text-white'}`} aria-hidden>
          {c.kind === 'bridge' ? '⇄' : c.kind === 'group' ? (members.get(c.id)?.length ?? '') : nameFor(c).slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{nameFor(c)}</span>
          <span className="block text-xs text-mute truncate">{sub}</span>
        </span>
        <span className="shrink-0 flex flex-col items-end gap-1">
          <span className={`text-xs ${unread ? 'text-gold-text font-semibold' : 'text-mute'}`}>{when(a?.at)}</span>
          {unread && <span className="w-2.5 h-2.5 rounded-full bg-gold" aria-label="Unread" />}
        </span>
      </button>
    );
  };

  const groupSub = (c: Conversation) => (members.get(c.id) ?? []).filter((u) => u !== userId).map((u) => nameOf(u).split(' (')[0]).join(', ');

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="label mb-1">Locked end to end · same organisation only <span className="rule" /></div>
          <h1 className="font-head font-extrabold text-3xl">MESSAGES</h1>
        </div>
        <button className="btn btn-gold" onClick={() => { setNewChat(true); setErr(''); }}>+ New chat</button>
      </div>

      <div className="flex gap-1 border-b border-line mb-4" role="tablist">
        {([['chats', 'Chats', unreadChats], ['bridges', 'Bridges', unreadBridges]] as const).map(([t, l, n]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 -mb-px border-b-2 font-head font-semibold text-sm tracking-wide ${tab === t ? 'border-gold text-text' : 'border-transparent text-mute'}`}>
            {l}{n > 0 && <span className="ml-2 bg-gold text-ink rounded-full text-[10px] px-1.5 py-0.5">{n}</span>}
          </button>
        ))}
      </div>
      {err && !active && <p className="card p-3 mb-3 text-sm text-danger" role="alert">{err}</p>}

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <aside className="space-y-4">
          {tab === 'chats' ? (
            <>
              <section className="card overflow-hidden">
                <h2 className="px-4 pt-3 pb-1 label">People</h2>
                {direct.length === 0 && <p className="px-4 pb-3 text-sm text-mute">No direct chats yet.</p>}
                <div className="divide-y divide-line">{direct.map((c) => <Row key={c.id} c={c} sub="Direct chat" />)}</div>
              </section>
              <section className="card overflow-hidden">
                <h2 className="px-4 pt-3 pb-1 label">Groups</h2>
                {groups.length === 0 && <p className="px-4 pb-3 text-sm text-mute">No group chats yet.</p>}
                <div className="divide-y divide-line">{groups.map((c) => <Row key={c.id} c={c} sub={groupSub(c)} />)}</div>
              </section>
            </>
          ) : (
            <>
              <section className="card overflow-hidden">
                <h2 className="px-4 pt-3 pb-1 label">Bridges you are on</h2>
                {bridgeConvs.length === 0 && <p className="px-4 pb-3 text-sm text-mute">Only administrators are on bridges.</p>}
                <div className="divide-y divide-line">{bridgeConvs.map((c) => <Row key={c.id} c={c} sub="Between organisations" />)}</div>
              </section>
              <section className="card p-4">
                <h2 className="font-head font-semibold mb-2">All bridges (visible to every member)</h2>
                {bridges.length === 0 && <p className="text-sm text-mute">No bridges to other organisations.</p>}
                {bridges.map((b) => (
                  <div key={b.bridge_id} className="text-sm py-2 border-t border-line first:border-0">
                    <div>⇄ <b>{b.other_org}</b> · {b.status}</div>
                    <div className="text-mute">Administrators: {b.participants.join(', ')}</div>
                    <div className="text-mute">{b.message_count} messages · last {b.last_message_at ? new Date(b.last_message_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}</div>
                  </div>
                ))}
                <p className="text-xs text-mute mt-2">You can see that a bridge exists and when it is used, but not what it says unless you are on it.</p>
              </section>
              <section className="card p-4">
                <h2 className="font-head font-semibold mb-1">Test the rule</h2>
                <p className="text-xs text-mute mb-2">Try to start a chat with someone from another organisation.</p>
                <button className="btn btn-line w-full" onClick={tryOutsider}>Try it</button>
                {outsider && <p className="text-sm mt-2">{outsider}</p>}
              </section>
            </>
          )}
        </aside>

        {/* The open chat: a panel on wide screens, full screen on phones */}
        <section className={`card flex-col overflow-hidden ${active ? 'flex fixed inset-0 z-[60] rounded-none lg:static lg:z-auto lg:rounded' : 'hidden lg:flex'} lg:h-[70vh]`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-mute p-6 text-center">Choose a chat. Messages are unlocked on this device.</div>
          ) : (
            <>
              <div className="px-3 py-3 border-b border-line flex items-center gap-2 bg-paper">
                <button className="lg:hidden btn btn-line !min-h-9 !px-3 !py-1" onClick={() => setActive(null)} aria-label="Back to chats">←</button>
                <div className="min-w-0">
                  <div className="font-head font-semibold truncate">{nameFor(active)}</div>
                  <div className="text-xs text-mute truncate">{active.kind === 'bridge' ? 'Bridge. Members of both organisations can see it exists and when it is used.' : active.kind === 'group' ? groupSub(active) : 'Direct chat · locked end to end'}</div>
                </div>
              </div>
              <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
                className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 bg-white">
                {msgs.length === 0 && <p className="text-sm text-mute text-center mt-8">No messages yet. Say hello.</p>}
                {msgs.map((m) => (
                  <div key={m.id} className={m.sender_id === userId ? 'text-right' : ''}>
                    <div className={`inline-block max-w-[85%] text-left rounded-2xl px-3 py-2 ${m.sender_id === userId ? 'bg-ink text-white rounded-br-sm' : 'bg-sand rounded-bl-sm'}`}>
                      <div className="text-[11px] opacity-70 mb-0.5">{m.sender_id === userId ? 'You' : nameOf(m.sender_id).split(' (')[0]} · {when(m.created_at)} {m.verified ? '✓' : '⚠'}</div>
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              {err && <p className="text-danger text-sm px-3 pt-2" role="alert">{err}</p>}
              <form className="p-3 border-t border-line flex gap-2 bg-paper pb-[calc(.75rem+env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" aria-label="Message" />
                <button className="btn btn-gold">Send</button>
              </form>
            </>
          )}
        </section>
      </div>

      {newChat && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setNewChat(false)}>
          <div className="bg-paper w-full sm:max-w-md rounded-t-2xl sm:rounded p-5 space-y-3 max-h-[85vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New chat">
            <div className="flex items-center justify-between">
              <h2 className="font-head font-extrabold text-lg">NEW CHAT</h2>
              <button className="text-sm underline text-mute" onClick={() => setNewChat(false)}>Cancel</button>
            </div>
            <p className="text-sm text-mute">Choose one person for a direct chat, or several for a group. Only members of {org?.name} can be added.</p>
            <div className="flex flex-wrap gap-2">
              {people.map((m) => {
                const ready = !!m.enc_pk;
                return (
                  <button key={m.user_id} disabled={!ready} title={ready ? '' : 'Has not finished setting up yet'}
                    onClick={() => setPick((p) => p.includes(m.user_id) ? p.filter((x) => x !== m.user_id) : [...p, m.user_id])}
                    className={`chip !py-2 !px-3 ${pick.includes(m.user_id) ? '!bg-ink !text-white' : ''} ${ready ? '' : 'opacity-40'}`}>{m.display_name}</button>
                );
              })}
            </div>
            {pick.length > 1 && <input className="input" placeholder={`Group name (optional, e.g. ${pick.map((u) => nameOf(u).split(' (')[0]).join(', ')})`} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Group name" />}
            {err && <p className="text-danger text-sm" role="alert">{err}</p>}
            <button className="btn btn-gold w-full" disabled={!pick.length || busy} onClick={create}>
              {busy ? 'Starting…' : pick.length > 1 ? `Start group with ${pick.length} people` : pick.length === 1 ? `Chat with ${nameOf(pick[0]).split(' (')[0]}` : 'Choose someone'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
