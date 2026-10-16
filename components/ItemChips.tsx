import type { OpenItem } from '@/lib/data';
import type { Group } from '@/lib/model';

export default function ItemChips({ it, groups }: { it: OpenItem; groups: Group[] }) {
  const p = it.payload;
  return (
    <div className="flex flex-wrap gap-1.5">
      {p.restrictions.gender === 'women' && <span className="chip chip-women">Women&apos;s knowledge</span>}
      {p.restrictions.gender === 'men' && <span className="chip chip-men">Men&apos;s knowledge</span>}
      {it.row.paused && <span className="chip chip-paused">Paused · sorry business</span>}
      {p.restrictions.sacred && <span className="chip chip-sacred">Sacred site · never public</span>}
      {p.restrictions.deceased && <span className="chip chip-warn">Mentions someone who has passed</span>}
      {p.restrictions.season && <span className="chip chip-warn">Season: {p.restrictions.season}</span>}
      {p.access.level === 'only_me' && <span className="chip">Only me</span>}
      {p.access.level === 'group' && <span className="chip">{groups.find((g) => g.id === p.access.groupId)?.name ?? 'Group'}</span>}
      {p.access.level === 'people' && <span className="chip">Chosen people</span>}
      {p.access.level === 'community' && !p.restrictions.gender && <span className="chip">Community</span>}
      {it.signatureOk ? <span className="chip chip-ok">✓ Signed</span> : <span className="chip chip-warn">Signature not checked</span>}
    </div>
  );
}
