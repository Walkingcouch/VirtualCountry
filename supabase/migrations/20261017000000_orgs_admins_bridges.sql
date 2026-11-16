-- Organisations, administrators and bridges (17 October 2026). Additive only: nothing is dropped.
-- 1. Anyone who has finished setting up can start an organisation and becomes its first administrator.
-- 2. Administrators can make other active members administrators, or remove the role. Every organisation keeps at least one.
-- 3. Bridges need both sides: an administrator asks (bridge_requests), an administrator of the other organisation accepts.

-- ---------- 1. Starting an organisation ----------
alter table orgs add column if not exists created_by uuid references auth.users(id);

create or replace function vc_trg_orgs() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform vc_log(new.id, 'org.created', 'org', new.id::text, jsonb_build_object('title', new.name, 'kind', new.kind, 'created_by', new.created_by));
  return new;
end $$;
create or replace trigger orgs_log after insert on orgs for each row execute function vc_trg_orgs();

create or replace function create_org(p_name text, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); v_org uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public_keys where user_id = v_uid) then raise exception 'Finish setting up your account before starting an organisation.'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 80 then raise exception 'Give the organisation a name between 3 and 80 characters.'; end if;
  if p_kind not in ('community', 'partner') then raise exception 'Choose community or partner organisation.'; end if;
  if exists (select 1 from orgs where lower(name) = lower(v_name)) then raise exception 'An organisation with that name already exists. Ask to join it instead, or choose another name.'; end if;
  if (select count(*) from orgs where created_by = v_uid) >= 3 then raise exception 'You can start up to 3 organisations in the demo.'; end if;
  insert into orgs (name, kind, founding_ca, created_by)
  values (v_name, p_kind, case when p_kind = 'community' then v_uid end, v_uid)
  returning id into v_org;
  insert into org_settings (org_id) values (v_org) on conflict do nothing;
  insert into org_members (org_id, user_id, status, is_admin, content_member, approved_by, approved_at)
  values (v_org, v_uid, 'active', true, true, v_uid, now());
  return v_org;
end $$;
revoke all on function create_org(text, text) from public, anon;
grant execute on function create_org(text, text) to authenticated;

-- ---------- 2. Administrator role guard ----------
create or replace function vc_guard_members() returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end $$;
create or replace trigger org_members_guard before update on org_members for each row execute function vc_guard_members();

-- ---------- 3. Bridge requests ----------
-- The old one-step function opened a bridge without the other side agreeing. Nobody can call it now.
revoke all on function create_bridge(uuid, uuid, uuid, text) from public, anon, authenticated;

create table if not exists bridge_requests (
  id uuid primary key default gen_random_uuid(),
  org_a uuid not null references orgs(id) on delete cascade,   -- asking
  org_b uuid not null references orgs(id) on delete cascade,   -- asked
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decided_by uuid references auth.users(id),
  bridge_id uuid references bridges(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (org_a <> org_b)
);
alter table bridge_requests enable row level security;
create policy bridge_requests_select on bridge_requests for select to authenticated using (vc_is_member(org_a) or vc_is_member(org_b));
-- no insert, update or delete policies: changes only through request_bridge and bridge_action

create or replace function vc_trg_bridge_requests() returns trigger language plpgsql security definer set search_path = public as $$
declare v_detail jsonb := jsonb_build_object('from', (select name from orgs where id = new.org_a), 'to', (select name from orgs where id = new.org_b));
begin
  if tg_op = 'INSERT' then
    v_detail := v_detail || jsonb_build_object('signed_by', new.requested_by);
    perform vc_log(new.org_a, 'bridge.requested', 'bridge', new.id::text, v_detail);
    perform vc_log(new.org_b, 'bridge.requested', 'bridge', new.id::text, v_detail);
  elsif new.status is distinct from old.status then
    v_detail := v_detail || jsonb_build_object('decided_by', auth.uid());
    perform vc_log(new.org_a, 'bridge.' || new.status, 'bridge', new.id::text, v_detail);
    perform vc_log(new.org_b, 'bridge.' || new.status, 'bridge', new.id::text, v_detail);
  end if;
  return new;
end $$;
create or replace trigger bridge_requests_log after insert or update on bridge_requests for each row execute function vc_trg_bridge_requests();

-- Bridges log with names (replaces the earlier version of this function)
create or replace function vc_trg_bridges() returns trigger language plpgsql security definer set search_path = public as $$
declare v_detail jsonb := jsonb_build_object('from', (select name from orgs where id = new.org_a), 'to', (select name from orgs where id = new.org_b));
begin
  if tg_op = 'INSERT' then
    v_detail := v_detail || jsonb_build_object('signed_by', new.approved_a_by, 'decided_by', new.approved_b_by);
    perform vc_log(new.org_a, 'bridge.created', 'bridge', new.id::text, v_detail);
    perform vc_log(new.org_b, 'bridge.created', 'bridge', new.id::text, v_detail);
  elsif new.status is distinct from old.status then
    v_detail := v_detail || jsonb_build_object('decided_by', auth.uid());
    perform vc_log(new.org_a, 'bridge.' || new.status, 'bridge', new.id::text, v_detail);
    perform vc_log(new.org_b, 'bridge.' || new.status, 'bridge', new.id::text, v_detail);
  end if;
  return new;
end $$;

create or replace function request_bridge(p_my_org uuid, p_other_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not vc_is_admin(p_my_org) then raise exception 'Only administrators can ask for a bridge.'; end if;
  if p_other_org is null or p_other_org = p_my_org then raise exception 'Choose another organisation.'; end if;
  if not exists (select 1 from orgs where id = p_other_org) then raise exception 'That organisation does not exist.'; end if;
  if not exists (select 1 from org_members where org_id = p_other_org and is_admin and status = 'active') then
    raise exception 'That organisation has no administrator to accept a bridge yet.';
  end if;
  if exists (select 1 from bridges where status = 'active'
             and ((org_a = p_my_org and org_b = p_other_org) or (org_a = p_other_org and org_b = p_my_org)))
     or exists (select 1 from bridge_requests where status = 'pending'
             and ((org_a = p_my_org and org_b = p_other_org) or (org_a = p_other_org and org_b = p_my_org))) then
    raise exception 'There is already a bridge or a waiting request between these organisations.';
  end if;
  insert into bridge_requests (org_a, org_b, requested_by) values (p_my_org, p_other_org, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- accept | decline (asked side) · withdraw (asking side): p_id is a request id
-- close (either side): p_id is a bridge id. Returns the bridge conversation id for accept and close.
create or replace function bridge_action(p_id uuid, p_action text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r bridge_requests%rowtype; b bridges%rowtype; v_conv uuid; v_bridge uuid; v_title text;
begin
  if p_action = 'close' then
    select * into b from bridges where id = p_id for update;
    if not found then raise exception 'That bridge no longer exists.'; end if;
    if b.status <> 'active' then raise exception 'Only an open bridge can be closed.'; end if;
    if not (vc_is_admin(b.org_a) or vc_is_admin(b.org_b)) then raise exception 'Only administrators of either organisation can close a bridge.'; end if;
    update bridges set status = 'closed' where id = b.id;
    return b.conversation_id;
  end if;

  select * into r from bridge_requests where id = p_id for update;
  if not found then raise exception 'That request no longer exists.'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been answered.'; end if;

  if p_action = 'withdraw' then
    if not vc_is_admin(r.org_a) then raise exception 'Only an administrator of the asking organisation can withdraw this request.'; end if;
    update bridge_requests set status = 'withdrawn', decided_by = auth.uid(), decided_at = now() where id = r.id;
    return null;
  end if;

  if p_action not in ('accept', 'decline') then raise exception 'Unknown bridge action.'; end if;
  if not vc_is_admin(r.org_b) then raise exception 'Only an administrator of the other organisation can answer this request.'; end if;
  if p_action = 'decline' then
    update bridge_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = r.id;
    return null;
  end if;

  v_title := (select name from orgs where id = r.org_a) || ' ⇄ ' || (select name from orgs where id = r.org_b);
  insert into conversations (org_id, kind, title, created_by) values (null, 'bridge', v_title, auth.uid()) returning id into v_conv;
  insert into conversation_members (conversation_id, user_id)
    select distinct v_conv, m.user_id from org_members m join public_keys k on k.user_id = m.user_id
    where m.org_id in (r.org_a, r.org_b) and m.is_admin and m.status = 'active';
  insert into bridges (org_a, org_b, conversation_id, approved_a_by, approved_b_by, status)
    values (r.org_a, r.org_b, v_conv, r.requested_by, auth.uid(), 'active') returning id into v_bridge;
  update bridge_requests set status = 'accepted', decided_by = auth.uid(), decided_at = now(), bridge_id = v_bridge where id = r.id;
  return v_conv;
end $$;

revoke all on function request_bridge(uuid, uuid) from public, anon;
revoke all on function bridge_action(uuid, text) from public, anon;
grant execute on function request_bridge(uuid, uuid) to authenticated;
grant execute on function bridge_action(uuid, text) to authenticated;

-- Messages on a bridge only while it is open
alter policy msg_insert on messages with check (
  sender_id = auth.uid() and vc_is_conv_member(conversation_id)
  and not exists (select 1 from bridges b where b.conversation_id = messages.conversation_id and b.status <> 'active')
);

-- Bridges and requests for every member of either organisation (existence and activity only, never content)
create or replace function list_bridges_v2(p_org uuid)
returns table (id uuid, kind text, other_org text, direction text, conversation_id uuid, requested_by text,
               participants text[], message_count bigint, last_message_at timestamptz, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, 'bridge',
         (select name from orgs where id = case when b.org_a = p_org then b.org_b else b.org_a end),
         case when b.org_a = p_org then 'outgoing' else 'incoming' end,
         b.conversation_id,
         (select display_name from profiles where id = b.approved_a_by),
         array(select p.display_name from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = b.conversation_id order by p.display_name),
         (select count(*) from messages m where m.conversation_id = b.conversation_id),
         (select max(created_at) from messages m where m.conversation_id = b.conversation_id),
         b.status, b.created_at
  from bridges b
  where (b.org_a = p_org or b.org_b = p_org) and vc_is_member(p_org)
  union all
  select r.id, 'request',
         (select name from orgs where id = case when r.org_a = p_org then r.org_b else r.org_a end),
         case when r.org_a = p_org then 'outgoing' else 'incoming' end,
         null, (select display_name from profiles where id = r.requested_by),
         '{}'::text[], 0, null, r.status, r.created_at
  from bridge_requests r
  where (r.org_a = p_org or r.org_b = p_org) and vc_is_member(p_org) and r.status in ('pending', 'declined')
  order by 11 desc;
$$;
revoke all on function list_bridges_v2(uuid) from public, anon;
grant execute on function list_bridges_v2(uuid) to authenticated;

-- Names of the people on bridges I am on, with their organisation
create or replace function bridge_people() returns table (conversation_id uuid, user_id uuid, display_name text, org_name text)
language sql stable security definer set search_path = public as $$
  select cm.conversation_id, cm.user_id, p.display_name,
         (select o.name from org_members m join orgs o on o.id = m.org_id
          where m.user_id = cm.user_id and m.org_id in (b.org_a, b.org_b) order by m.is_admin desc limit 1)
  from bridges b
  join conversation_members cm on cm.conversation_id = b.conversation_id
  join profiles p on p.id = cm.user_id
  where exists (select 1 from conversation_members me where me.conversation_id = b.conversation_id and me.user_id = auth.uid());
$$;
revoke all on function bridge_people() from public, anon;
grant execute on function bridge_people() to authenticated;
