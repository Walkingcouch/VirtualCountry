-- A second person checks every public summary (18 November 2026).
-- When a community has another active Cultural Authority, a Cultural Authority cannot sign a summary they drafted themselves.
-- A community with only one Cultural Authority keeps working as before. This is a governance choice and can be reversed by
-- restoring the previous body of sign_release (20261116000000_audit_hardening.sql).
create or replace function sign_release(p_release uuid, p_sig text) returns void
language plpgsql security definer set search_path = public as $$
declare v releases;
begin
  select * into v from releases where id = p_release for update;
  if v is null or v.status <> 'pending' then raise exception 'release is not awaiting signature'; end if;
  if not vc_is_ca(v.org_id, auth.uid()) then raise exception 'only a Cultural Authority of this community can sign'; end if;
  if v.created_by = auth.uid() and exists (
       select 1 from org_members m where m.org_id = v.org_id and m.user_id <> auth.uid() and m.status = 'active' and vc_is_ca(v.org_id, m.user_id)) then
    raise exception 'You drafted this summary, so another Cultural Authority needs to check and sign it.';
  end if;
  if not exists (select 1 from items i where i.id = v.source_item_id and i.org_id = v.org_id and i.deleted_at is null and not i.sacred and not i.paused) then
    raise exception 'sacred, paused or deleted material, or material from another community, can never be released';
  end if;
  update releases set status = 'published', signer_id = auth.uid(), sig = p_sig, published_at = now() where id = p_release and status = 'pending';
end $$;
