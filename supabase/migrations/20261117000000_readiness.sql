-- Production readiness (17 November 2026). Additive: nothing is dropped.
--  1. People removed from a community can no longer fetch items they once held keys for.
--  2. Chats are created in one step, so a failed set-up cannot leave an empty chat behind.
--  3. New administrators join their organisation's open bridges.
--  4. Limits on join requests, bridge requests, messages and waiting releases.
--  5. Indexes for the most used lookups.

-- ---------- 1. Item access needs active membership ----------
create or replace function vc_has_envelope(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from item_keys k join items i on i.id = k.item_id
    join org_members m on m.org_id = i.org_id and m.user_id = k.recipient_id
    where k.item_id = p_item and k.recipient_id = auth.uid() and k.sealed_key <> 'revoked' and m.status = 'active');
$$;

alter policy versions_select on item_versions using (
  vc_is_holder(item_id) or (vc_has_envelope(item_id) and exists (
    select 1 from item_keys k where k.item_id = item_versions.item_id and k.version = item_versions.version
      and k.recipient_id = auth.uid() and k.sealed_key <> 'revoked')));

alter policy keys_select on item_keys using (
  (recipient_id = auth.uid() and sealed_key <> 'revoked' and vc_has_envelope(item_id)) or vc_is_holder(item_id));

-- ---------- 2. One-step chat creation ----------
create or replace function create_conversation(p_id uuid, p_org uuid, p_title text, p_members uuid[], p_keys jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_members uuid[]; v_title text := btrim(coalesce(p_title, ''));
begin
  if v_uid is null or not vc_is_member(p_org) then raise exception 'Only members of this organisation can start a chat here.'; end if;
  select array_agg(distinct u) into v_members from unnest(p_members || v_uid) u;
  if cardinality(v_members) < 2 or cardinality(v_members) > 50 then raise exception 'A chat needs between 2 and 50 people.'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then raise exception 'Give the chat a name of up to 120 characters.'; end if;
  if exists (select 1 from unnest(v_members) u where not exists (
       select 1 from org_members m join public_keys k on k.user_id = m.user_id
       where m.org_id = p_org and m.user_id = u and m.status = 'active')) then
    raise exception 'Everyone in a chat must be an active member who has finished setting up.';
  end if;
  if (select count(*) from jsonb_array_elements(p_keys)) <> cardinality(v_members)
     or exists (select 1 from unnest(v_members) u where not exists (
       select 1 from jsonb_array_elements(p_keys) k where (k->>'recipient_id')::uuid = u and char_length(k->>'sealed_key') between 20 and 400)) then
    raise exception 'Each person in the chat needs exactly one locked key.';
  end if;
  if (select count(*) from conversations where created_by = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'You have started a lot of chats in the last hour. Try again later.';
  end if;
  insert into conversations (id, org_id, kind, title, created_by)
  values (p_id, p_org, case when cardinality(v_members) = 2 then 'direct' else 'group' end, v_title, v_uid);
  insert into conversation_members (conversation_id, user_id) select p_id, u from unnest(v_members) u;
  insert into conversation_keys (conversation_id, key_version, recipient_id, sealed_key)
  select p_id, 1, (k->>'recipient_id')::uuid, k->>'sealed_key' from jsonb_array_elements(p_keys) k;
  return p_id;
end $$;

-- ---------- 3. New administrators and bridges ----------
create or replace function vc_sync_bridge_admins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin and new.status = 'active' and not (old.is_admin and old.status = 'active') then
    insert into conversation_members (conversation_id, user_id)
    select b.conversation_id, new.user_id from bridges b
    where b.status = 'active' and new.org_id in (b.org_a, b.org_b)
      and exists (select 1 from public_keys k where k.user_id = new.user_id)
    on conflict do nothing;
  end if;
  return new;
end $$;
create or replace trigger org_members_bridge_sync after update on org_members for each row execute function vc_sync_bridge_admins();

-- People in a chat who do not hold its current key yet (for example a new administrator on a bridge).
create or replace function conv_missing_keys(p_conv uuid) returns table (user_id uuid, enc_pk text)
language sql stable security definer set search_path = public as $$
  select cm.user_id, k.enc_pk
  from conversation_members cm join conversations c on c.id = cm.conversation_id join public_keys k on k.user_id = cm.user_id
  where cm.conversation_id = p_conv and vc_is_conv_member(p_conv)
    and not exists (select 1 from conversation_keys ck
                    where ck.conversation_id = cm.conversation_id and ck.key_version = c.key_version and ck.recipient_id = cm.user_id);
$$;

-- ---------- 4. Limits ----------
create or replace function vc_limit_join_requests() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.status = 'pending'
     and (select count(*) from org_members where user_id = new.user_id and status = 'pending') >= 5 then
    raise exception 'You already have 5 requests waiting. Wait for an answer before asking to join another organisation.';
  end if;
  return new;
end $$;
create or replace trigger org_members_limit before insert on org_members for each row execute function vc_limit_join_requests();

create index if not exists messages_sender_created_idx on messages (sender_id, created_at);
create or replace function vc_limit_messages() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'You are sending messages very quickly. Wait a moment and try again.';
  end if;
  return new;
end $$;
create or replace trigger messages_limit before insert on messages for each row execute function vc_limit_messages();

create unique index if not exists releases_one_pending_idx on releases (source_item_id) where status = 'pending';

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
  if exists (select 1 from bridges where status = 'active' and ((org_a = p_my_org and org_b = p_other_org) or (org_a = p_other_org and org_b = p_my_org)))
     or exists (select 1 from bridge_requests where status = 'pending' and ((org_a = p_my_org and org_b = p_other_org) or (org_a = p_other_org and org_b = p_my_org))) then
    raise exception 'There is already a bridge or a waiting request between these organisations.';
  end if;
  if (select count(*) from bridge_requests where org_a = p_my_org and status = 'pending') >= 5 then
    raise exception 'Your organisation already has 5 bridge requests waiting.';
  end if;
  if exists (select 1 from bridge_requests where org_a = p_my_org and org_b = p_other_org and status = 'declined' and decided_at > now() - interval '24 hours') then
    raise exception 'That organisation declined a bridge in the last day. Wait before asking again.';
  end if;
  insert into bridge_requests (org_a, org_b, requested_by) values (p_my_org, p_other_org, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ---------- 5. Indexes ----------
create index if not exists org_members_user_idx on org_members (user_id);
create index if not exists conversation_members_user_idx on conversation_members (user_id);
create index if not exists conversation_keys_recipient_idx on conversation_keys (recipient_id);
create index if not exists conversations_org_idx on conversations (org_id);
create index if not exists releases_org_idx on releases (org_id);
create index if not exists items_holder_idx on items (holder_id);
create index if not exists groups_org_idx on groups (org_id);
create index if not exists group_members_user_idx on group_members (user_id);
create index if not exists legacy_wishes_org_idx on legacy_wishes (org_id);
create index if not exists legacy_wishes_item_idx on legacy_wishes (item_id);
create index if not exists legacy_keepers_keeper_idx on legacy_keepers (keeper_id);
create index if not exists legacy_approvals_recipient_idx on legacy_approvals (recipient_id);
create index if not exists bridges_conversation_idx on bridges (conversation_id);
create index if not exists bridge_requests_org_a_idx on bridge_requests (org_a);
create index if not exists bridge_requests_org_b_idx on bridge_requests (org_b);

-- ---------- Grants ----------
revoke execute on all functions in schema public from public, anon;
revoke execute on function vc_sync_bridge_admins(), vc_limit_join_requests(), vc_limit_messages() from authenticated;
revoke execute on function list_bridges(uuid) from authenticated;
grant execute on function create_conversation(uuid, uuid, text, uuid[], jsonb), conv_missing_keys(uuid) to authenticated;
