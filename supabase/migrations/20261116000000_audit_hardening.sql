-- Security and operations hardening (16 November 2026). Additive: no table, column or policy is dropped.
--  1. Cultural Authority power and chat access need active membership.
--  2. Membership changes: no self-granted content keys, approver stamped by the server, every change logged.
--  3. Keys can only be sealed to people on the signed recipient list. Versions go up one at a time.
--  4. Public releases must belong to the community that holds the item.
--  5. Removed standings and withdrawn legacy approvals cannot be quietly restored.
--  6. Groups: changes are logged, members can be taken out, only active members can be added.
--  7. Holders can delete an item for good.
--  8. Least-privilege grants for tables and functions. Public keys are no longer listable by everyone.

-- ---------- 1. Active membership behind every power ----------
create or replace function vc_is_ca(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = any(vc_ca_set(p_org))
     and exists (select 1 from org_members m where m.org_id = p_org and m.user_id = p_user and m.status = 'active');
$$;

create or replace function vc_is_conv_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members cm join conversations c on c.id = cm.conversation_id
    where cm.conversation_id = p_conv and cm.user_id = auth.uid()
      and case when c.kind = 'bridge' then
            exists (select 1 from bridges b join org_members m on m.org_id in (b.org_a, b.org_b)
                    where b.conversation_id = c.id and m.user_id = auth.uid() and m.status = 'active' and m.is_admin)
          else
            exists (select 1 from org_members m where m.org_id = c.org_id and m.user_id = auth.uid() and m.status = 'active')
          end);
$$;

-- ---------- 2. Membership guard and log ----------
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
      if new.status = 'pending' then raise exception 'A decided request cannot go back to waiting.'; end if;
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

create or replace function vc_trg_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text, jsonb_build_object('status', new.status, 'content_member', new.content_member));
    return new;
  end if;
  if new.status is distinct from old.status then
    perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text, jsonb_build_object('from', old.status, 'to', new.status, 'decided_by', auth.uid()));
  end if;
  if new.is_admin is distinct from old.is_admin then
    perform vc_log(new.org_id, case when new.is_admin then 'member.admin_granted' else 'member.admin_removed' end, 'user', new.user_id::text, jsonb_build_object('decided_by', auth.uid()));
  end if;
  if new.content_member is distinct from old.content_member then
    perform vc_log(new.org_id, case when new.content_member then 'member.content_granted' else 'member.content_removed' end, 'user', new.user_id::text, jsonb_build_object('decided_by', auth.uid()));
  end if;
  return new;
end $$;

-- ---------- 3. Keys follow the signed recipient list ----------
create or replace function vc_guard_item_keys() returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_holder uuid;
begin
  if v_uid is null then return new; end if;
  select holder_id into v_holder from items where id = new.item_id;
  if v_holder = v_uid and not exists (
       select 1 from item_versions v where v.item_id = new.item_id and v.version = new.version and new.recipient_id = any(v.recipients)) then
    raise exception 'A key can only be given to someone on the signed list for this version.';
  end if;
  return new;
end $$;
create or replace trigger item_keys_guard before insert on item_keys for each row execute function vc_guard_item_keys();

create or replace function save_item(p_item_id uuid, p_org uuid, p_version integer, p_nonce text, p_ciphertext text, p_ct_hash text,
  p_recipients uuid[], p_recipients_hash text, p_sig text, p_keys jsonb, p_paused boolean, p_sacred boolean) returns void
language plpgsql set search_path = public as $$
declare r uuid; k jsonb; v_cur integer;
begin
  if p_version < 1 then raise exception 'Version numbers start at 1.'; end if;
  if not auth.uid() = any(p_recipients) then raise exception 'The holder is always on the list of people who can open an item.'; end if;
  foreach r in array p_recipients loop
    if r <> auth.uid() and not vc_is_content_member(p_org, r) then
      raise exception 'recipient % is not an active member of this community', r;
    end if;
  end loop;
  if p_version = 1 then
    insert into items (id, org_id, holder_id, current_version, paused, sacred)
    values (p_item_id, p_org, auth.uid(), 1, p_paused, p_sacred);
  else
    select current_version into v_cur from items where id = p_item_id and holder_id = auth.uid() and deleted_at is null for update;
    if not found then raise exception 'only the holder can change this item'; end if;
    if p_version <> v_cur + 1 then raise exception 'This item was changed somewhere else. Refresh the page and try again.'; end if;
  end if;
  insert into item_versions (item_id, version, nonce, ciphertext, ct_hash, recipients, recipients_hash, author_id, author_sig)
  values (p_item_id, p_version, p_nonce, p_ciphertext, p_ct_hash, p_recipients, p_recipients_hash, auth.uid(), p_sig);
  for k in select * from jsonb_array_elements(p_keys) loop
    insert into item_keys (item_id, version, recipient_id, sealed_key)
    values (p_item_id, p_version, (k->>'recipient_id')::uuid, k->>'sealed_key');
  end loop;
  if p_version > 1 then
    update items set current_version = p_version, paused = p_paused, sacred = p_sacred where id = p_item_id and holder_id = auth.uid();
    update item_keys set sealed_key = 'revoked' where item_id = p_item_id and version < p_version and recipient_id <> auth.uid();
  end if;
end $$;

-- ---------- 4. Releases stay inside the item's community ----------
alter policy rel_insert on releases with check (
  created_by = auth.uid() and status = 'pending' and vc_is_holder(source_item_id)
  and exists (select 1 from items i where i.id = releases.source_item_id and i.org_id = releases.org_id
              and i.deleted_at is null and not i.sacred and not i.paused));

create or replace function sign_release(p_release uuid, p_sig text) returns void
language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release for update;
  if v is null or v.status <> 'pending' then raise exception 'release is not awaiting signature'; end if;
  if not vc_is_ca(v.org_id, auth.uid()) then raise exception 'only a Cultural Authority of this community can sign'; end if;
  if not exists (select 1 from items i where i.id = v.source_item_id and i.org_id = v.org_id and i.deleted_at is null and not i.sacred and not i.paused) then
    raise exception 'sacred, paused or deleted material, or material from another community, can never be released';
  end if;
  update releases set status = 'published', signer_id = auth.uid(), sig = p_sig, published_at = now() where id = p_release and status = 'pending';
end $$;

create or replace function withdraw_release(p_release uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release for update;
  if v is null then raise exception 'not found'; end if;
  if v.status not in ('pending', 'published') then raise exception 'This summary has already been withdrawn or sent back.'; end if;
  if not (v.created_by = auth.uid() or vc_is_ca(v.org_id, auth.uid())) then raise exception 'not allowed'; end if;
  update releases set status = 'withdrawn', withdrawn_at = now() where id = p_release;
end $$;

-- ---------- 5. One-way removals ----------
create or replace function vc_guard_attest() returns trigger language plpgsql set search_path = public as $$
begin
  if old.revoked_at is not null then raise exception 'This has already been removed. Confirm it again instead.'; end if;
  return new;
end $$;
create or replace trigger attestations_guard before update on attestations for each row execute function vc_guard_attest();

create or replace function vc_guard_legacy_approvals() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.withdrawn_at is not null and new.withdrawn_at is null and not vc_legacy_can_approve(new.wish_id, new.recipient_id) then
    raise exception 'This legacy wish is no longer open, so the agreement cannot be given again.';
  end if;
  return new;
end $$;
create or replace trigger legacy_approvals_guard before update on legacy_approvals for each row execute function vc_guard_legacy_approvals();

create or replace function vc_trg_legacy_approvals() returns trigger language plpgsql security definer set search_path = public as $$
declare w record;
begin
  select org_id, item_id into w from legacy_wishes where id = new.wish_id;
  if tg_op = 'INSERT' or (new.withdrawn_at is null and old.withdrawn_at is not null) then
    perform vc_log(w.org_id, 'legacy.release_agreed', 'user', new.recipient_id::text, jsonb_build_object('wish', new.wish_id, 'item', w.item_id, 'keeper', new.keeper_id, 'to', new.recipient_id));
  elsif new.withdrawn_at is not null and old.withdrawn_at is null then
    perform vc_log(w.org_id, 'legacy.release_withdrawn', 'user', new.recipient_id::text, jsonb_build_object('wish', new.wish_id, 'item', w.item_id, 'keeper', new.keeper_id));
  end if;
  return new;
end $$;

-- ---------- 6. Groups ----------
alter policy gm_insert on group_members with check (
  exists (select 1 from groups g join org_members m on m.org_id = g.org_id
          where g.id = group_members.group_id and vc_is_admin(g.org_id) and m.user_id = group_members.user_id and m.status = 'active'));

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'group_members' and policyname = 'gm_delete') then
    create policy gm_delete on group_members for delete to authenticated
      using (exists (select 1 from groups g where g.id = group_members.group_id and vc_is_admin(g.org_id)));
  end if;
end $$;

create or replace function vc_trg_groups() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform vc_log(new.org_id, 'group.created', 'group', new.id::text, jsonb_build_object('title', new.name, 'kind', new.kind, 'created_by', auth.uid()));
  return new;
end $$;
create or replace trigger groups_log after insert on groups for each row execute function vc_trg_groups();

create or replace function vc_trg_group_members() returns trigger language plpgsql security definer set search_path = public as $$
declare g record; r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select org_id, name into g from groups where id = r.group_id;
  if g.org_id is null then return r; end if;
  perform vc_log(g.org_id, case when tg_op = 'DELETE' then 'group.member_removed' else 'group.member_added' end, 'user', r.user_id::text,
    jsonb_build_object('group', g.name, 'subject', r.user_id, 'decided_by', auth.uid()));
  return r;
end $$;
create or replace trigger group_members_log after insert or delete on group_members for each row execute function vc_trg_group_members();

-- ---------- 7. Deleting an item for good ----------
create or replace function delete_item(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from items where id = p_item and holder_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Only the holder can delete this item.'; end if;
  update legacy_wishes set status = 'revoked', closed_at = now() where item_id = p_item and status = 'active';
  update releases set status = 'withdrawn', withdrawn_at = now() where source_item_id = p_item and status = 'pending';
  update item_keys set sealed_key = 'revoked' where item_id = p_item;
  update item_versions set ciphertext = '', nonce = '' where item_id = p_item;
  update items set deleted_at = now() where id = p_item;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_delete') then
    create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and vc_is_holder(((storage.foldername(name))[2])::uuid));
  end if;
end $$;

-- ---------- 8. Public keys ----------
alter policy pk_select on public_keys to authenticated using (vc_shares_org(user_id));
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'public_keys' and policyname = 'pk_select_signer') then
    create policy pk_select_signer on public_keys for select to anon, authenticated
      using (exists (select 1 from releases r where r.signer_id = public_keys.user_id and r.status = 'published'));
  end if;
end $$;

-- ---------- 9. Size limits ----------
alter table releases add constraint releases_place_label_len check (char_length(place_label) <= 200);
alter table conversations add constraint conversations_title_len check (char_length(title) between 1 and 120);
alter table groups add constraint groups_name_len check (char_length(btrim(name)) between 1 and 60);
alter table messages add constraint messages_ciphertext_len check (char_length(ciphertext) <= 200000);
alter table item_versions add constraint item_versions_ciphertext_len check (char_length(ciphertext) <= 4000000);

-- ---------- 10. Least-privilege grants ----------
revoke all on all tables in schema public from anon;
grant select on releases, profiles, public_keys to anon;
revoke all on all sequences in schema public from anon;

revoke truncate, references, trigger, delete on all tables in schema public from authenticated;
grant delete on group_members to authenticated;

revoke insert, update on orgs, bridges, bridge_requests, audit_log, audit_details, operators from authenticated;
revoke insert on org_settings from authenticated;
revoke update on releases, conversations, conversation_members, conversation_keys, messages, item_versions, groups, group_members,
  items, item_keys, attestations, org_members, org_settings, public_keys, vaults, profiles from authenticated;
grant update (current_version, paused, sacred) on items to authenticated;
grant update (sealed_key) on item_keys to authenticated;
grant update (revoked_at) on attestations to authenticated;
grant update (status, is_admin, content_member, approved_by, approved_at) on org_members to authenticated;
grant update (ai_curator, ai_help, idle_lock_minutes, public_blur_percent) on org_settings to authenticated;
grant update (enc_pk, sign_pk, updated_at, version) on public_keys to authenticated;
grant update (amk_pin, amk_recovery, identity, updated_at) on vaults to authenticated;
grant update (id, display_name) on profiles to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function
  vc_guard_members(), vc_guard_item_keys(), vc_guard_attest(), vc_guard_legacy_approvals(),
  vc_trg_orgs(), vc_trg_bridge_requests(), vc_trg_item_keys(), vc_trg_item_versions(), vc_trg_legacy_approvals(),
  vc_trg_legacy_keepers(), vc_trg_legacy_wishes(), vc_trg_groups(), vc_trg_group_members(),
  vc_item_access_detail(uuid, integer, integer), vc_ca_set(uuid)
  from authenticated;
grant execute on function delete_item(uuid) to authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
