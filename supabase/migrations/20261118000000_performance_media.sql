-- Performance and file access (18 November 2026). Additive: nothing is dropped.
--  1. Access rules work out who is signed in once per query, not once per row.
--     Each public policy is rewritten in place with auth.uid() wrapped as (select auth.uid()). The rules themselves do not change.
--  2. Indexes for the remaining foreign keys.
--  3. Encrypted files can be downloaded only by the item's holder or someone holding a key for it.

-- ---------- 1. auth.uid() once per query ----------
do $$
declare p record; q text; w text; stmt text;
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(p.qual, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )auth\.uid\(\)', '(select auth.uid())', 'g');
    w := regexp_replace(p.with_check, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )auth\.uid\(\)', '(select auth.uid())', 'g');
    if q is distinct from p.qual or w is distinct from p.with_check then
      stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
      if q is not null then stmt := stmt || format(' using (%s)', q); end if;
      if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
      execute stmt;
    end if;
  end loop;
end $$;

-- ---------- 2. Foreign key indexes ----------
create index if not exists attestations_issuer_idx on attestations (issuer_id);
create index if not exists attestations_subject_idx on attestations (subject_id);
create index if not exists bridge_requests_bridge_idx on bridge_requests (bridge_id);
create index if not exists bridge_requests_decided_by_idx on bridge_requests (decided_by);
create index if not exists bridge_requests_requested_by_idx on bridge_requests (requested_by);
create index if not exists bridges_approved_a_idx on bridges (approved_a_by);
create index if not exists bridges_approved_b_idx on bridges (approved_b_by);
create index if not exists bridges_org_a_idx on bridges (org_a);
create index if not exists bridges_org_b_idx on bridges (org_b);
create index if not exists conversations_created_by_idx on conversations (created_by);
create index if not exists item_versions_author_idx on item_versions (author_id);
create index if not exists legacy_approvals_keeper_idx on legacy_approvals (keeper_id);
create index if not exists legacy_wishes_holder_idx on legacy_wishes (holder_id);
create index if not exists org_members_approved_by_idx on org_members (approved_by);
create index if not exists orgs_created_by_idx on orgs (created_by);
create index if not exists orgs_founding_ca_idx on orgs (founding_ca);
create index if not exists releases_created_by_idx on releases (created_by);
create index if not exists releases_signer_idx on releases (signer_id);

-- ---------- 3. Encrypted files follow the item's keys ----------
create or replace function vc_can_read_media(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_item uuid;
begin
  begin
    v_org := ((storage.foldername(p_name))[1])::uuid;
    v_item := ((storage.foldername(p_name))[2])::uuid;
  exception when others then return false;
  end;
  return vc_is_member(v_org) and (vc_is_holder(v_item) or vc_has_envelope(v_item));
end $$;
revoke execute on function vc_can_read_media(text) from public, anon;
grant execute on function vc_can_read_media(text) to authenticated;

alter policy media_read on storage.objects using (bucket_id = 'media' and vc_can_read_media(name));
