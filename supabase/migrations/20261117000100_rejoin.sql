-- A person who left, or was removed, can ask to join again (17 November 2026). An administrator still has to approve them.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'org_members' and policyname = 'members_rejoin') then
    create policy members_rejoin on org_members for update to authenticated
      using (user_id = auth.uid() and status = 'removed')
      with check (user_id = auth.uid() and status = 'pending' and not is_admin);
  end if;
end $$;

create or replace function vc_guard_members() returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if new.org_id <> old.org_id or new.user_id <> old.user_id then
    raise exception 'A membership cannot be moved to another person or organisation.';
  end if;
  if new.is_admin and new.status <> 'active' then
    raise exception 'Only approved members can be administrators.';
  end if;
  if old.is_admin and old.status = 'active' and (not new.is_admin or new.status <> 'active')
     and not exists (select 1 from org_members m where m.org_id = old.org_id and m.user_id <> old.user_id and m.is_admin and m.status = 'active') then
    raise exception 'Every organisation needs at least one administrator. Make someone else an administrator first.';
  end if;
  if old.status = 'active' and new.status <> 'active' and vc_is_ca(old.org_id, old.user_id)
     and not exists (select 1 from org_members m where m.org_id = old.org_id and m.user_id <> old.user_id and m.status = 'active' and vc_is_ca(m.org_id, m.user_id)) then
    raise exception 'This person is the only Cultural Authority. Confirm another Cultural Authority first.';
  end if;
  if v_uid is not null then
    if new.content_member is distinct from old.content_member and old.user_id = v_uid then
      raise exception 'You cannot change your own content keys setting. Another administrator has to do it.';
    end if;
    if new.status is distinct from old.status then
      if new.status = 'pending' then
        if old.status <> 'removed' or old.user_id <> v_uid then raise exception 'A decided request cannot go back to waiting.'; end if;
        if (select count(*) from org_members where user_id = v_uid and status = 'pending') >= 5 then
          raise exception 'You already have 5 requests waiting. Wait for an answer before asking to join another organisation.';
        end if;
        new.approved_by := null;
        new.approved_at := null;
        new.requested_at := now();
        return new;
      end if;
      new.approved_by := v_uid;
      new.approved_at := now();
    else
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    end if;
    new.requested_at := old.requested_at;
  end if;
  return new;
end $$;
