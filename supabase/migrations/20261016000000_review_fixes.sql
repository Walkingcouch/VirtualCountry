-- Review fixes (16 Oct 2026)
-- 1. Governance log detail, readable by administrators and Cultural Authorities only, and chained into the log
-- 2. A new Cultural Authority needs two existing Cultural Authorities (the founding CA can appoint the second alone)
-- 3. Legacy access: knowledge passed on later, released only when Legacy Keepers agree

/* =========================================================
   1. Governance log detail
   ========================================================= */
alter table audit_log add column if not exists detail_hash text;

create table if not exists audit_details (
  audit_id bigint primary key references audit_log(id),
  org_id uuid not null,
  detail jsonb not null
);
alter table audit_details enable row level security;
create policy audit_details_select on audit_details for select to authenticated
  using (vc_is_admin(org_id) or vc_is_ca(org_id, auth.uid()));
revoke insert, update, delete, truncate on audit_details from anon, authenticated;
create trigger audit_details_no_update before update or delete on audit_details
  for each row execute function vc_block_change();

create or replace function vc_log(p_org uuid, p_action text, p_type text, p_target text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev text;
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('vc.actor', true), '')::uuid);
  v_at timestamptz := clock_timestamp();
  v_dh text;
  v_id bigint;
begin
  if pg_trigger_depth() = 0 then raise exception 'vc_log can only be called by triggers'; end if;
  perform pg_advisory_xact_lock(hashtext('vc_audit_' || p_org::text));
  select hash into v_prev from audit_log where org_id = p_org order by id desc limit 1;
  v_prev := coalesce(v_prev, 'genesis');
  if p_detail is not null then v_dh := encode(extensions.digest(p_detail::text, 'sha256'), 'hex'); end if;
  insert into audit_log (org_id, actor_id, action, target_type, target_id, at, prev_hash, hash, detail_hash)
  values (p_org, v_actor, p_action, p_type, p_target, v_at, v_prev,
    encode(extensions.digest(v_prev || '|' || p_org || '|' || coalesce(v_actor::text, '') || '|' || p_action || '|' || p_type || '|' || p_target || '|'
      || to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || coalesce('|' || v_dh, ''), 'sha256'), 'hex'), v_dh)
  returning id into v_id;
  if p_detail is not null then insert into audit_details (audit_id, org_id, detail) values (v_id, p_org, p_detail); end if;
end $$;

create or replace function vc_log(p_org uuid, p_action text, p_type text, p_target text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform vc_log(p_org, p_action, p_type, p_target, null::jsonb);
end $$;

revoke execute on function vc_log(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function vc_log(uuid, text, text, text) from public, anon, authenticated;

create or replace function verify_audit_chain(p_org uuid)
returns table(ok boolean, entries integer, head text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_prev text := 'genesis'; v_ok boolean := true; v_n int := 0;
begin
  if not vc_is_member(p_org) then raise exception 'not a member'; end if;
  for r in select l.*, d.detail from audit_log l left join audit_details d on d.audit_id = l.id where l.org_id = p_org order by l.id loop
    v_n := v_n + 1;
    if r.prev_hash <> v_prev
       or r.hash <> encode(extensions.digest(r.prev_hash || '|' || r.org_id || '|' || coalesce(r.actor_id::text, '') || '|' || r.action || '|' || r.target_type || '|' || r.target_id || '|'
            || to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || coalesce('|' || r.detail_hash, ''), 'sha256'), 'hex')
       or (r.detail_hash is not null and (r.detail is null or r.detail_hash <> encode(extensions.digest(r.detail::text, 'sha256'), 'hex'))) then
      v_ok := false;
    end if;
    v_prev := r.hash;
  end loop;
  return query select v_ok, v_n, v_prev;
end $$;

-- Triggers now record detail
create or replace function vc_trg_attest() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform vc_log(new.org_id, 'attestation.issued:' || new.claim, 'user', new.subject_id::text,
      jsonb_build_object('claim', new.claim, 'subject', new.subject_id, 'signed_by', new.issuer_id, 'issued_at', new.issued_at));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform vc_log(new.org_id, 'attestation.revoked:' || new.claim, 'user', new.subject_id::text,
      jsonb_build_object('claim', new.claim, 'subject', new.subject_id, 'originally_signed_by', new.issuer_id, 'removed_by', auth.uid()));
  end if;
  return new;
end $$;

create or replace function vc_trg_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text, jsonb_build_object('status', new.status, 'content_member', new.content_member));
  elsif new.status is distinct from old.status then
    perform vc_log(new.org_id, 'member.' || new.status, 'user', new.user_id::text, jsonb_build_object('from', old.status, 'to', new.status, 'decided_by', auth.uid()));
  elsif new.is_admin is distinct from old.is_admin then
    perform vc_log(new.org_id, case when new.is_admin then 'member.admin_granted' else 'member.admin_removed' end, 'user', new.user_id::text, jsonb_build_object('decided_by', auth.uid()));
  end if;
  return new;
end $$;

create or replace function vc_item_access_detail(p_item uuid, p_old int, p_new int) returns jsonb
language sql stable security definer set search_path = public as $$
  with o as (select coalesce((select recipients from item_versions where item_id = p_item and version = p_old), '{}'::uuid[]) r),
       n as (select coalesce((select recipients from item_versions where item_id = p_item and version = p_new), '{}'::uuid[]) r)
  select jsonb_build_object(
    'version', p_new,
    'people_now', cardinality(n.r),
    'added', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(n.r) x where not x = any(o.r)),
    'removed', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(o.r) x where not x = any(n.r)))
  from o, n;
$$;

create or replace function vc_trg_items() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'item.created', 'item', new.id::text);
  else
    if new.current_version <> old.current_version then d := vc_item_access_detail(new.id, old.current_version, new.current_version); end if;
    if new.paused and not old.paused then perform vc_log(new.org_id, 'item.paused', 'item', new.id::text, d); end if;
    if old.paused and not new.paused then perform vc_log(new.org_id, 'item.unpaused', 'item', new.id::text, d); end if;
    if new.current_version <> old.current_version and new.paused = old.paused then perform vc_log(new.org_id, 'item.rekeyed', 'item', new.id::text, d); end if;
    if new.deleted_at is not null and old.deleted_at is null then perform vc_log(new.org_id, 'item.deleted', 'item', new.id::text); end if;
  end if;
  return new;
end $$;

-- First version: record who received keys
create or replace function vc_trg_item_versions() returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if new.version = 1 then
    select org_id into v_org from items where id = new.item_id;
    perform vc_log(v_org, 'item.shared', 'item', new.item_id::text, jsonb_build_object('version', 1, 'people_now', cardinality(new.recipients), 'added', to_jsonb(new.recipients), 'removed', '[]'::jsonb));
  end if;
  return new;
end $$;
create or replace trigger item_versions_log after insert on item_versions for each row execute function vc_trg_item_versions();

create or replace function vc_trg_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform vc_log(new.org_id, 'settings.changed', 'org', new.org_id::text,
    jsonb_build_object('before', to_jsonb(old) - 'org_id', 'after', to_jsonb(new) - 'org_id'));
  return new;
end $$;

create or replace function vc_trg_releases() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform vc_log(new.org_id, 'release.drafted', 'release', new.id::text, jsonb_build_object('title', new.title, 'drafted_by', new.created_by));
  elsif new.status is distinct from old.status then
    perform vc_log(new.org_id, 'release.' || new.status, 'release', new.id::text, jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status, 'signed_by', new.signer_id));
  end if;
  return new;
end $$;

/* =========================================================
   2. Two Cultural Authorities to appoint a third
   ========================================================= */
-- Same rule as lib/access.ts: attestations are read in the order they were issued.
-- A person becomes a CA once enough current CAs have signed: one while the founding CA is alone, two after that.
create or replace function vc_ca_set(p_org uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare v_cas uuid[]; v_appr jsonb := '{}'::jsonb; v_list jsonb; r record; v_need int;
begin
  select array_remove(array[founding_ca], null) into v_cas from orgs where id = p_org;
  v_cas := coalesce(v_cas, '{}'::uuid[]);
  for r in select subject_id, issuer_id from attestations
           where org_id = p_org and claim = 'role:cultural_authority' and revoked_at is null and subject_id <> issuer_id
           order by issued_at, id loop
    if r.issuer_id = any(v_cas) and not r.subject_id = any(v_cas) then
      v_list := coalesce(v_appr -> (r.subject_id::text), '[]'::jsonb);
      if not v_list @> jsonb_build_array(r.issuer_id::text) then v_list := v_list || to_jsonb(r.issuer_id::text); end if;
      v_appr := jsonb_set(v_appr, array[r.subject_id::text], v_list);
      v_need := least(2, greatest(cardinality(v_cas), 1));
      if jsonb_array_length(v_list) >= v_need then
        v_cas := v_cas || r.subject_id;
      end if;
    end if;
  end loop;
  return v_cas;
end $$;

create or replace function vc_is_ca(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = any(vc_ca_set(p_org));
$$;

alter policy att_insert on attestations with check (
  issuer_id = auth.uid() and vc_is_ca(org_id, auth.uid()) and vc_is_member(org_id)
  and (claim <> 'role:cultural_authority' or subject_id <> auth.uid()));

/* =========================================================
   3. Legacy access
   ========================================================= */
-- The item key is split into shares (Shamir). Each Legacy Keeper holds one share, sealed to them.
-- No keeper, administrator or the platform can open the item alone. When enough keepers agree that the holder's
-- wishes are met, each re-seals their share to the chosen person, whose device joins the shares and receives the key.
-- The wishes themselves (who, who never, when) are encrypted. Only the holder and the keepers can read them.
create table if not exists legacy_wishes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  holder_id uuid not null default auth.uid() references auth.users(id),
  item_version int not null,
  threshold int not null check (threshold >= 2),
  key_check text not null,
  nonce text not null,
  wish_ct text not null,
  holder_wish_key text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'replaced', 'fulfilled')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create table if not exists legacy_keepers (
  wish_id uuid not null references legacy_wishes(id) on delete cascade,
  keeper_id uuid not null references auth.users(id),
  sealed_share text not null,
  sealed_wish_key text not null,
  primary key (wish_id, keeper_id)
);
create table if not exists legacy_approvals (
  wish_id uuid not null references legacy_wishes(id) on delete cascade,
  keeper_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  sealed_share text not null,
  approved_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (wish_id, keeper_id, recipient_id)  -- a keeper can release to several people, e.g. each great-grandchild
);
alter table legacy_wishes enable row level security;
alter table legacy_keepers enable row level security;
alter table legacy_approvals enable row level security;

create or replace function vc_wish_org(p_wish uuid) returns uuid language sql stable security definer set search_path = public as $$
  select org_id from legacy_wishes where id = p_wish;
$$;
create or replace function vc_is_wish_holder(p_wish uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from legacy_wishes w where w.id = p_wish and w.holder_id = auth.uid());
$$;
create or replace function vc_is_wish_keeper(p_wish uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from legacy_keepers k where k.wish_id = p_wish and k.keeper_id = auth.uid());
$$;
create or replace function vc_is_wish_recipient(p_wish uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from legacy_approvals a where a.wish_id = p_wish and a.recipient_id = auth.uid() and a.withdrawn_at is null);
$$;
create or replace function vc_legacy_can_approve(p_wish uuid, p_recipient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from legacy_wishes w
    where w.id = p_wish and w.status = 'active'
      and p_recipient <> w.holder_id and p_recipient <> auth.uid()
      and vc_is_content_member(w.org_id, auth.uid())
      and vc_is_content_member(w.org_id, p_recipient)
      and exists (select 1 from legacy_keepers k where k.wish_id = w.id and k.keeper_id = auth.uid()));
$$;
create or replace function vc_legacy_can_claim(p_item uuid, p_version int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from legacy_wishes w join items i on i.id = w.item_id
    where w.item_id = p_item and w.status = 'active' and w.item_version = p_version and i.current_version = p_version
      and vc_is_content_member(w.org_id, auth.uid())
      and (select count(distinct a.keeper_id) from legacy_approvals a
           where a.wish_id = w.id and a.recipient_id = auth.uid() and a.withdrawn_at is null) >= w.threshold);
$$;

create policy wishes_select on legacy_wishes for select to authenticated
  using (holder_id = auth.uid() or vc_is_wish_keeper(id) or vc_is_wish_recipient(id));
create policy wishes_insert on legacy_wishes for insert to authenticated
  with check (holder_id = auth.uid() and vc_is_content_member(org_id, auth.uid())
    and exists (select 1 from items i where i.id = item_id and i.org_id = legacy_wishes.org_id and i.holder_id = auth.uid() and i.current_version = item_version));
create policy wishes_update on legacy_wishes for update to authenticated
  using (holder_id = auth.uid()) with check (holder_id = auth.uid());

create policy keepers_select on legacy_keepers for select to authenticated
  using (keeper_id = auth.uid() or vc_is_wish_holder(wish_id));
create policy keepers_insert on legacy_keepers for insert to authenticated
  with check (vc_is_wish_holder(wish_id) and keeper_id <> auth.uid()
    and vc_is_content_member(vc_wish_org(wish_id), keeper_id)
    and not exists (select 1 from legacy_approvals a where a.wish_id = legacy_keepers.wish_id));

create policy approvals_select on legacy_approvals for select to authenticated
  using (keeper_id = auth.uid() or recipient_id = auth.uid() or vc_is_wish_holder(wish_id) or vc_is_wish_keeper(wish_id));
create policy approvals_insert on legacy_approvals for insert to authenticated
  with check (keeper_id = auth.uid() and vc_legacy_can_approve(wish_id, recipient_id));
create policy approvals_withdraw on legacy_approvals for update to authenticated
  using (keeper_id = auth.uid()) with check (keeper_id = auth.uid());

-- Only these columns can change after a wish or approval is made
revoke update, delete, truncate on legacy_wishes, legacy_keepers, legacy_approvals from anon, authenticated;
revoke all on legacy_wishes, legacy_keepers, legacy_approvals from anon;
grant update (status, closed_at) on legacy_wishes to authenticated;
grant update (withdrawn_at) on legacy_approvals to authenticated;

-- A person released to by enough keepers may add their own envelope for that item version
create policy keys_legacy_claim on item_keys for insert to authenticated
  with check (recipient_id = auth.uid() and vc_legacy_can_claim(item_id, version));

-- Logging
create or replace function vc_trg_legacy_wishes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform vc_log(new.org_id, 'legacy.wish_made', 'item', new.item_id::text, jsonb_build_object('wish', new.id, 'keepers_needed', new.threshold, 'item_version', new.item_version));
  elsif new.status is distinct from old.status then
    perform vc_log(new.org_id, 'legacy.wish_' || new.status, 'item', new.item_id::text, jsonb_build_object('wish', new.id, 'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger legacy_wishes_log after insert or update on legacy_wishes for each row execute function vc_trg_legacy_wishes();

create or replace function vc_trg_legacy_keepers() returns trigger language plpgsql security definer set search_path = public as $$
declare w record;
begin
  select org_id, item_id into w from legacy_wishes where id = new.wish_id;
  perform vc_log(w.org_id, 'legacy.keeper_named', 'user', new.keeper_id::text, jsonb_build_object('wish', new.wish_id, 'item', w.item_id));
  return new;
end $$;
create trigger legacy_keepers_log after insert on legacy_keepers for each row execute function vc_trg_legacy_keepers();

create or replace function vc_trg_legacy_approvals() returns trigger language plpgsql security definer set search_path = public as $$
declare w record;
begin
  select org_id, item_id into w from legacy_wishes where id = new.wish_id;
  if tg_op = 'INSERT' then
    perform vc_log(w.org_id, 'legacy.release_agreed', 'user', new.recipient_id::text, jsonb_build_object('wish', new.wish_id, 'item', w.item_id, 'keeper', new.keeper_id, 'to', new.recipient_id));
  elsif new.withdrawn_at is not null and old.withdrawn_at is null then
    perform vc_log(w.org_id, 'legacy.release_withdrawn', 'user', new.recipient_id::text, jsonb_build_object('wish', new.wish_id, 'item', w.item_id, 'keeper', new.keeper_id));
  end if;
  return new;
end $$;
create trigger legacy_approvals_log after insert or update on legacy_approvals for each row execute function vc_trg_legacy_approvals();

create or replace function vc_trg_item_keys() returns trigger language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select org_id, holder_id into i from items where id = new.item_id;
  if new.recipient_id = auth.uid() and i.holder_id <> auth.uid() then
    perform vc_log(i.org_id, 'legacy.received', 'item', new.item_id::text, jsonb_build_object('received_by', new.recipient_id, 'version', new.version));
  end if;
  return new;
end $$;
create or replace trigger item_keys_log after insert on item_keys for each row execute function vc_trg_item_keys();
