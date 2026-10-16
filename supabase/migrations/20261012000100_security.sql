-- Virtual Country: Row Level Security, helper functions, audit chain and RPCs (Part E, E8; Part F, F6)

-- ============================================================
-- Helper functions (security definer so policies don't recurse)
-- ============================================================
create or replace function public.vc_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.vc_is_content_member(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m where m.org_id = p_org and m.user_id = p_user and m.status = 'active' and m.content_member);
$$;

create or replace function public.vc_is_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.is_admin);
$$;

create or replace function public.vc_is_ca(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orgs o where o.id = p_org and o.founding_ca = p_user)
      or exists (select 1 from attestations a where a.org_id = p_org and a.subject_id = p_user
                 and a.claim = 'role:cultural_authority' and a.revoked_at is null);
$$;

create or replace function public.vc_shares_org(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_other = auth.uid() or exists (
    select 1 from org_members a join org_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_other and b.status <> 'removed')
  or exists (
    select 1 from conversation_members a join conversation_members b on a.conversation_id = b.conversation_id
    where a.user_id = auth.uid() and b.user_id = p_other);
$$;

create or replace function public.vc_is_holder(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from items i where i.id = p_item and i.holder_id = auth.uid());
$$;

create or replace function public.vc_has_envelope(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from item_keys k where k.item_id = p_item and k.recipient_id = auth.uid() and k.sealed_key <> 'revoked');
$$;

create or replace function public.vc_is_conv_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members c where c.conversation_id = p_conv and c.user_id = auth.uid());
$$;

create or replace function public.vc_can_add_to_conv(p_conv uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c join org_members m on m.org_id = c.org_id
                 where c.id = p_conv and c.created_by = auth.uid() and c.kind <> 'bridge'
                   and m.user_id = p_user and m.status = 'active')
     and exists (select 1 from conversations c join org_members me on me.org_id = c.org_id
                 where c.id = p_conv and me.user_id = auth.uid() and me.status = 'active');
$$;

grant execute on all functions in schema public to authenticated;

-- ============================================================
-- Tamper-evident audit chain
-- ============================================================
create or replace function public.vc_log(p_org uuid, p_action text, p_type text, p_target text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev text;
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('vc.actor', true), '')::uuid);
  v_at timestamptz := clock_timestamp();
begin
  -- only callable from the logging triggers, never directly by a client
  if pg_trigger_depth() = 0 then raise exception 'vc_log can only be called by triggers'; end if;
  perform pg_advisory_xact_lock(hashtext('vc_audit_' || p_org::text));
  select hash into v_prev from audit_log where org_id = p_org order by id desc limit 1;
  v_prev := coalesce(v_prev, 'genesis');
  insert into audit_log (org_id, actor_id, action, target_type, target_id, at, prev_hash, hash)
  values (p_org, v_actor, p_action, p_type, p_target, v_at, v_prev,
    encode(extensions.digest(v_prev || '|' || p_org || '|' || coalesce(v_actor::text, '') || '|' || p_action || '|' || p_type || '|' || p_target || '|' || to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'sha256'), 'hex'));
end $$;

create or replace function public.vc_block_change() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.vc_block_change();

create or replace function public.verify_audit_chain(p_org uuid)
returns table (ok boolean, entries int, head text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_prev text := 'genesis'; v_ok boolean := true; v_n int := 0;
begin
  if not vc_is_member(p_org) then raise exception 'not a member'; end if;
  for r in select * from audit_log where org_id = p_org order by id loop
    v_n := v_n + 1;
    if r.prev_hash <> v_prev or r.hash <> encode(extensions.digest(r.prev_hash || '|' || r.org_id || '|' || coalesce(r.actor_id::text, '') || '|' || r.action || '|' || r.target_type || '|' || r.target_id || '|' || to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'sha256'), 'hex') then
      v_ok := false;
    end if;
    v_prev := r.hash;
  end loop;
  return query select v_ok, v_n, v_prev;
end $$;

-- Event triggers: record actions, never content
create or replace function public.vc_trg_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text);
  elsif new.status is distinct from old.status then perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text);
  elsif new.is_admin is distinct from old.is_admin then perform vc_log(new.org_id, case when new.is_admin then 'member.admin_granted' else 'member.admin_removed' end, 'user', new.user_id::text);
  end if;
  return new;
end $$;
create trigger org_members_log after insert or update on public.org_members for each row execute function public.vc_trg_members();

create or replace function public.vc_trg_attest() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'attestation.issued:' || new.claim, 'user', new.subject_id::text);
  elsif new.revoked_at is not null and old.revoked_at is null then perform vc_log(new.org_id, 'attestation.revoked:' || new.claim, 'user', new.subject_id::text);
  end if;
  return new;
end $$;
create trigger attestations_log after insert or update on public.attestations for each row execute function public.vc_trg_attest();

create or replace function public.vc_trg_items() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'item.created', 'item', new.id::text);
  else
    if new.paused and not old.paused then perform vc_log(new.org_id, 'item.paused', 'item', new.id::text); end if;
    if old.paused and not new.paused then perform vc_log(new.org_id, 'item.unpaused', 'item', new.id::text); end if;
    if new.current_version <> old.current_version and new.paused = old.paused then perform vc_log(new.org_id, 'item.rekeyed', 'item', new.id::text); end if;
    if new.deleted_at is not null and old.deleted_at is null then perform vc_log(new.org_id, 'item.deleted', 'item', new.id::text); end if;
  end if;
  return new;
end $$;
create trigger items_log after insert or update on public.items for each row execute function public.vc_trg_items();

create or replace function public.vc_trg_releases() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'release.drafted', 'release', new.id::text);
  elsif new.status is distinct from old.status then perform vc_log(new.org_id, 'release.' || new.status, 'release', new.id::text);
  end if;
  return new;
end $$;
create trigger releases_log after insert or update on public.releases for each row execute function public.vc_trg_releases();

create or replace function public.vc_trg_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform vc_log(new.org_id, 'settings.changed', 'org', new.org_id::text);
  return new;
end $$;
create trigger org_settings_log after update on public.org_settings for each row execute function public.vc_trg_settings();

create or replace function public.vc_trg_bridges() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform vc_log(new.org_a, 'bridge.created', 'bridge', new.id::text);
    perform vc_log(new.org_b, 'bridge.created', 'bridge', new.id::text);
  elsif new.status is distinct from old.status then
    perform vc_log(new.org_a, 'bridge.' || new.status, 'bridge', new.id::text);
    perform vc_log(new.org_b, 'bridge.' || new.status, 'bridge', new.id::text);
  end if;
  return new;
end $$;
create trigger bridges_log after insert or update on public.bridges for each row execute function public.vc_trg_bridges();

-- ============================================================
-- Enable RLS everywhere
-- ============================================================
alter table public.profiles enable row level security;
alter table public.public_keys enable row level security;
alter table public.vaults enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_settings enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.attestations enable row level security;
alter table public.operators enable row level security;
alter table public.items enable row level security;
alter table public.item_versions enable row level security;
alter table public.item_keys enable row level security;
alter table public.releases enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_keys enable row level security;
alter table public.messages enable row level security;
alter table public.bridges enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (vc_shares_org(id));
create policy profiles_select_signer on public.profiles for select to anon, authenticated
  using (exists (select 1 from releases r where r.signer_id = profiles.id and r.status = 'published'));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- public keys are public by design
create policy pk_select on public.public_keys for select to anon, authenticated using (true);
create policy pk_insert on public.public_keys for insert to authenticated with check (user_id = auth.uid());
create policy pk_update on public.public_keys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- vaults: owner only
create policy vault_select on public.vaults for select to authenticated using (user_id = auth.uid());
create policy vault_insert on public.vaults for insert to authenticated with check (user_id = auth.uid());
create policy vault_update on public.vaults for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orgs: names are visible so people can ask to join
create policy orgs_select on public.orgs for select to authenticated using (true);

-- org members
create policy members_select on public.org_members for select to authenticated using (user_id = auth.uid() or vc_is_member(org_id));
create policy members_request on public.org_members for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and not is_admin);
create policy members_admin_update on public.org_members for update to authenticated
  using (vc_is_admin(org_id)) with check (vc_is_admin(org_id));
create policy members_leave on public.org_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'removed' and not is_admin);

-- settings
create policy settings_select on public.org_settings for select to authenticated using (vc_is_member(org_id));
create policy settings_update on public.org_settings for update to authenticated using (vc_is_admin(org_id)) with check (vc_is_admin(org_id));

-- groups
create policy groups_select on public.groups for select to authenticated using (vc_is_member(org_id));
create policy groups_insert on public.groups for insert to authenticated with check (vc_is_admin(org_id));
create policy gm_select on public.group_members for select to authenticated
  using (exists (select 1 from groups g where g.id = group_id and vc_is_member(g.org_id)));
create policy gm_insert on public.group_members for insert to authenticated
  with check (exists (select 1 from groups g where g.id = group_id and vc_is_admin(g.org_id)));

-- attestations: only Cultural Authorities may issue, and only as themselves
create policy att_select on public.attestations for select to authenticated using (vc_is_member(org_id));
create policy att_insert on public.attestations for insert to authenticated
  with check (issuer_id = auth.uid() and vc_is_ca(org_id, auth.uid()) and vc_is_member(org_id));
create policy att_revoke on public.attestations for update to authenticated
  using (vc_is_ca(org_id, auth.uid())) with check (vc_is_ca(org_id, auth.uid()));

-- operators: infrastructure only. No policy anywhere grants operators content.
create policy operators_self on public.operators for select to authenticated using (user_id = auth.uid());

-- items: holder, or anyone holding an envelope
create policy items_select on public.items for select to authenticated
  using (holder_id = auth.uid() or vc_has_envelope(id));
create policy items_insert on public.items for insert to authenticated
  with check (holder_id = auth.uid() and vc_is_content_member(org_id, auth.uid()));
create policy items_update on public.items for update to authenticated
  using (holder_id = auth.uid()) with check (holder_id = auth.uid());

create policy versions_select on public.item_versions for select to authenticated
  using (vc_is_holder(item_id) or exists (select 1 from item_keys k where k.item_id = item_versions.item_id and k.version = item_versions.version and k.recipient_id = auth.uid() and k.sealed_key <> 'revoked'));
create policy versions_insert on public.item_versions for insert to authenticated
  with check (author_id = auth.uid() and vc_is_holder(item_id));

create policy keys_select on public.item_keys for select to authenticated
  using ((recipient_id = auth.uid() and sealed_key <> 'revoked') or vc_is_holder(item_id));
create policy keys_insert on public.item_keys for insert to authenticated with check (vc_is_holder(item_id));
create policy keys_update on public.item_keys for update to authenticated using (vc_is_holder(item_id)) with check (vc_is_holder(item_id));

-- releases
create policy rel_public on public.releases for select to anon, authenticated using (status = 'published');
create policy rel_members on public.releases for select to authenticated using (vc_is_member(org_id));
create policy rel_insert on public.releases for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending' and vc_is_holder(source_item_id)
              and not exists (select 1 from items i where i.id = source_item_id and (i.sacred or i.paused)));

-- conversations
create policy conv_select on public.conversations for select to authenticated using (vc_is_conv_member(id));
create policy conv_insert on public.conversations for insert to authenticated
  with check (created_by = auth.uid() and kind <> 'bridge' and vc_is_member(org_id));
create policy cm_select on public.conversation_members for select to authenticated using (vc_is_conv_member(conversation_id));
-- Same-organisation rule: the creator may only add active members of the conversation's own organisation
create policy cm_insert on public.conversation_members for insert to authenticated
  with check (public.vc_can_add_to_conv(conversation_id, user_id));
create policy ck_select on public.conversation_keys for select to authenticated using (recipient_id = auth.uid());
create policy ck_insert on public.conversation_keys for insert to authenticated
  with check (vc_is_conv_member(conversation_id)
              and exists (select 1 from conversation_members m where m.conversation_id = conversation_keys.conversation_id and m.user_id = recipient_id));
create policy msg_select on public.messages for select to authenticated using (vc_is_conv_member(conversation_id));
create policy msg_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and vc_is_conv_member(conversation_id));

-- bridges: metadata visible to every member of both organisations (transparency)
create policy bridges_select on public.bridges for select to authenticated using (vc_is_member(org_a) or vc_is_member(org_b));

-- audit log: members read; nobody writes directly
create policy audit_select on public.audit_log for select to authenticated using (vc_is_member(org_id));

-- ============================================================
-- RPCs
-- ============================================================

-- Save a new item or a new version atomically. Runs with the caller's rights (RLS applies).
create or replace function public.save_item(
  p_item_id uuid, p_org uuid, p_version int, p_nonce text, p_ciphertext text, p_ct_hash text,
  p_recipients uuid[], p_recipients_hash text, p_sig text, p_keys jsonb, p_paused boolean, p_sacred boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare r uuid; k jsonb;
begin
  -- every recipient must be the holder or an active content member of this organisation
  foreach r in array p_recipients loop
    if r <> auth.uid() and not vc_is_content_member(p_org, r) then
      raise exception 'recipient % is not an active member of this community', r;
    end if;
  end loop;
  if p_version = 1 then
    insert into items (id, org_id, holder_id, current_version, paused, sacred)
    values (p_item_id, p_org, auth.uid(), 1, p_paused, p_sacred);
  end if;
  insert into item_versions (item_id, version, nonce, ciphertext, ct_hash, recipients, recipients_hash, author_id, author_sig)
  values (p_item_id, p_version, p_nonce, p_ciphertext, p_ct_hash, p_recipients, p_recipients_hash, auth.uid(), p_sig);
  for k in select * from jsonb_array_elements(p_keys) loop
    insert into item_keys (item_id, version, recipient_id, sealed_key)
    values (p_item_id, p_version, (k->>'recipient_id')::uuid, k->>'sealed_key');
  end loop;
  if p_version > 1 then
    update items set current_version = p_version, paused = p_paused, sacred = p_sacred where id = p_item_id and holder_id = auth.uid();
    if not found then raise exception 'only the holder can change this item'; end if;
    -- earlier envelopes for everyone except the holder are destroyed, so removed people cannot open old versions
    update item_keys set sealed_key = 'revoked' where item_id = p_item_id and version < p_version and recipient_id <> auth.uid();
  end if;
end $$;

-- A Cultural Authority of the same community signs and publishes a release
create or replace function public.sign_release(p_release uuid, p_sig text)
returns void language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release;
  if v is null or v.status <> 'pending' then raise exception 'release is not awaiting signature'; end if;
  if not vc_is_ca(v.org_id, auth.uid()) then raise exception 'only a Cultural Authority of this community can sign'; end if;
  if not vc_is_member(v.org_id) then raise exception 'not a member'; end if;
  if exists (select 1 from items i where i.id = v.source_item_id and (i.sacred or i.paused)) then
    raise exception 'sacred or paused material can never be released';
  end if;
  update releases set status = 'published', signer_id = auth.uid(), sig = p_sig, published_at = now() where id = p_release and status = 'pending';
end $$;

create or replace function public.reject_release(p_release uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release;
  if v is null or v.status <> 'pending' then raise exception 'release is not awaiting signature'; end if;
  if not vc_is_ca(v.org_id, auth.uid()) then raise exception 'only a Cultural Authority can reject'; end if;
  update releases set status = 'rejected' where id = p_release;
end $$;

create or replace function public.withdraw_release(p_release uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release;
  if v is null then raise exception 'not found'; end if;
  if not (v.created_by = auth.uid() or vc_is_ca(v.org_id, auth.uid())) then raise exception 'not allowed'; end if;
  update releases set status = 'withdrawn', withdrawn_at = now() where id = p_release;
end $$;

-- Bridge summaries for members of either organisation (metadata only)
create or replace function public.list_bridges(p_org uuid)
returns table (bridge_id uuid, other_org text, participants text[], message_count bigint, last_message_at timestamptz, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id,
         (select name from orgs where id = case when b.org_a = p_org then b.org_b else b.org_a end),
         array(select p.display_name from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = b.conversation_id order by p.display_name),
         (select count(*) from messages m where m.conversation_id = b.conversation_id),
         (select max(created_at) from messages m where m.conversation_id = b.conversation_id),
         b.status, b.created_at
  from bridges b
  where (b.org_a = p_org or b.org_b = p_org) and vc_is_member(p_org);
$$;

-- Administrators open a bridge to another organisation's administrator
create or replace function public.create_bridge(p_my_org uuid, p_other_org uuid, p_other_admin uuid, p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_bridge uuid;
begin
  if not vc_is_admin(p_my_org) then raise exception 'only administrators can open a bridge'; end if;
  if not exists (select 1 from org_members where org_id = p_other_org and user_id = p_other_admin and is_admin and status = 'active') then
    raise exception 'the other person must be an administrator of the other organisation';
  end if;
  insert into conversations (org_id, kind, title, created_by) values (null, 'bridge', p_title, auth.uid()) returning id into v_conv;
  insert into conversation_members (conversation_id, user_id) values (v_conv, auth.uid()), (v_conv, p_other_admin);
  insert into bridges (org_a, org_b, conversation_id, approved_a_by) values (p_my_org, p_other_org, v_conv, auth.uid()) returning id into v_bridge;
  return v_conv;
end $$;

-- Directory of members for sealing keys: active members, roles and public keys (no content)
create or replace function public.org_directory(p_org uuid)
returns table (user_id uuid, display_name text, is_admin boolean, content_member boolean, status text, enc_pk text, sign_pk text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.is_admin, m.content_member, m.status, k.enc_pk, k.sign_pk
  from org_members m join profiles p on p.id = m.user_id left join public_keys k on k.user_id = m.user_id
  where m.org_id = p_org and vc_is_member(p_org);
$$;

-- ============================================================
-- Storage: encrypted media only. Path = <org_id>/<item_id>/<file>
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 6291456)
on conflict (id) do nothing;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.vc_is_member(((storage.foldername(name))[1])::uuid));
create policy media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.vc_is_content_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- ============================================================
-- Function permissions: nothing callable without signing in; internal functions not callable at all
-- ============================================================
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.vc_log(uuid, text, text, text) from authenticated;
revoke execute on function public.vc_trg_members() from authenticated;
revoke execute on function public.vc_trg_attest() from authenticated;
revoke execute on function public.vc_trg_items() from authenticated;
revoke execute on function public.vc_trg_releases() from authenticated;
revoke execute on function public.vc_trg_settings() from authenticated;
revoke execute on function public.vc_trg_bridges() from authenticated;
revoke execute on function public.vc_block_change() from authenticated;
grant select on public.releases, public.public_keys, public.profiles to anon;
