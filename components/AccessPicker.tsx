'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { eligibleRecipients } from '@/lib/access';
import type { AccessLevel, Gender, ItemPayload } from '@/lib/model';

export interface AccessValue {
  level: AccessLevel;
  groupId: string;
  people: string[];
  gender: Gender;
  deceased: boolean;
  sacred: boolean;
  season: string;
}

export const accessFromPayload = (p: ItemPayload): AccessValue => ({
  level: p.access.level, groupId: p.access.groupId ?? '', people: p.access.people ?? [],
  gender: p.restrictions.gender, deceased: p.restrictions.deceased, sacred: p.restrictions.sacred, season: p.restrictions.season ?? '',
});

export const applyAccess = (p: ItemPayload, v: AccessValue): ItemPayload => ({
  ...p,
  access: { level: v.level, groupId: v.level === 'group' ? v.groupId : undefined, people: v.level === 'people' ? v.people : undefined },
  restrictions: { gender: v.gender, sacred: v.sacred, deceased: v.deceased, season: v.season || null },
  labels: [
    ...p.labels.filter((l) => !['tk-women', 'tk-men', 'tk-seasonal'].includes(l)),
    ...(v.gender === 'women' ? ['tk-women'] : v.gender === 'men' ? ['tk-men'] : []),
    ...(v.season ? ['tk-seasonal'] : []),
  ],
});

/** Who can open an item, plus cultural restrictions. Shows exactly who will receive a key, worked out on this device. */
export default function AccessPicker({ value, onChange, onRecipients }: { value: AccessValue; onChange: (v: AccessValue) => void; onRecipients?: (ids: string[]) => void }) {
  const { dir, userId, nameOf } = useSession();
  const [recipients, setRecipients] = useState<string[]>([]);
  const others = (dir?.members ?? []).filter((m) => m.status === 'active' && m.content_member && m.user_id !== userId);
  const set = (patch: Partial<AccessValue>) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (!dir || !userId) return;
    eligibleRecipients(dir, userId, {
      access: { level: value.level, groupId: value.groupId, people: value.people },
      restrictions: { gender: value.gender, sacred: value.sacred, deceased: value.deceased, season: value.season || null },
    }).then((r) => { setRecipients(r); onRecipients?.(r); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, userId, value.level, value.groupId, value.people, value.gender, value.sacred, value.deceased, value.season]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([['only_me', 'Only me'], ['people', 'People I choose'], ['group', 'A group'], ['community', 'Whole community']] as const).map(([v, l]) => (
          <button type="button" key={v} onClick={() => set({ level: v })} className={`btn ${value.level === v ? 'btn-ink' : 'btn-line'} !text-[.68rem]`}>{l}</button>
        ))}
      </div>
      {value.level === 'group' && (
        <select className="select" value={value.groupId} onChange={(e) => set({ groupId: e.target.value })} aria-label="Group">
          <option value="">Choose a group</option>
          {dir?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
      {value.level === 'people' && (
        <div className="flex flex-wrap gap-2">
          {others.map((m) => (
            <button type="button" key={m.user_id} onClick={() => set({ people: value.people.includes(m.user_id) ? value.people.filter((x) => x !== m.user_id) : [...value.people, m.user_id] })}
              className={`chip !py-1.5 ${value.people.includes(m.user_id) ? '!bg-ink !text-white' : ''}`}>{m.display_name}</button>
          ))}
        </div>
      )}
      <h3 className="font-head font-semibold pt-2">Cultural restrictions</h3>
      <div className="grid grid-cols-3 gap-2">
        {([[null, 'None'], ['women', "Women's"], ['men', "Men's"]] as const).map(([v, l]) => (
          <button type="button" key={l} onClick={() => set({ gender: v })} className={`btn ${value.gender === v ? 'btn-ink' : 'btn-line'} !text-[.68rem]`}>{l}</button>
        ))}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={value.deceased} onChange={(e) => set({ deceased: e.target.checked })} /> Shows or names someone who has passed away</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={value.sacred} onChange={(e) => set({ sacred: e.target.checked })} /> Sacred site or secret/sacred (can never be public)</label>
      <input className="input" value={value.season} onChange={(e) => set({ season: e.target.value })} placeholder="Restricted season (optional), e.g. November to February" aria-label="Restricted season" />
      <div className="rounded border border-gold/60 bg-sand/60 p-3">
        <div className="text-sm font-semibold mb-1">Will be able to open it</div>
        <ul className="space-y-0.5 text-sm">
          {recipients.map((r) => <li key={r} className="flex items-center gap-2"><span className="text-ok">●</span>{r === userId ? 'You' : nameOf(r)}</li>)}
        </ul>
        {value.gender && <p className="text-xs text-mute mt-2">Only people a Cultural Authority has confirmed for {value.gender === 'women' ? "women's" : "men's"} standing are included.</p>}
      </div>
    </div>
  );
}
