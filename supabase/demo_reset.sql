-- Demo reset. Removes the invented Demo Country data so seed.sql can load it fresh.
-- For the demonstration database ONLY. It deletes the two demo organisations, everything in them, and the six demo people.
-- Accounts and organisations made by real testers are left alone, but their membership of the demo organisations goes with those organisations.
-- Run through scripts/demo-reset.sh, which checks the target first.
begin;
do $$
declare v_orgs uuid[]; v_users uuid[];
begin
  select array_agg(id) into v_users from auth.users where email like '%.demo@example.com';
  select array_agg(id) into v_orgs from orgs where name in ('Demo Country', 'Demo University (partner)');
  if v_users is null or v_orgs is null then raise exception 'Demo data not found. Nothing was changed.'; end if;
  if exists (select 1 from orgs where id = any(v_orgs) and created_by is not null and not created_by = any(v_users)) then
    raise exception 'An organisation with a demo name was started by a real account. Nothing was changed.';
  end if;
  -- The governance log is append-only. Lifting that for this transaction is the only way to clear the demo organisations.
  alter table audit_log disable trigger audit_log_no_update;
  alter table audit_details disable trigger audit_details_no_update;
  delete from storage.objects where bucket_id = 'media' and (storage.foldername(name))[1] = any(select o::text from unnest(v_orgs) o);
  delete from bridge_requests where org_a = any(v_orgs) or org_b = any(v_orgs);
  delete from bridges where org_a = any(v_orgs) or org_b = any(v_orgs);
  delete from messages where conversation_id in (select id from conversations where org_id = any(v_orgs) or (kind = 'bridge' and created_by = any(v_users)));
  delete from conversations where org_id = any(v_orgs) or (kind = 'bridge' and created_by = any(v_users));
  delete from legacy_wishes where org_id = any(v_orgs);
  delete from releases where org_id = any(v_orgs);
  delete from items where org_id = any(v_orgs);
  delete from audit_details where org_id = any(v_orgs);
  delete from audit_log where org_id = any(v_orgs);
  delete from orgs where id = any(v_orgs);
  delete from vaults where user_id = any(v_users);
  delete from public_keys where user_id = any(v_users);
  delete from profiles where id = any(v_users);
  delete from auth.identities where user_id = any(v_users);
  delete from auth.users where id = any(v_users);
  alter table audit_log enable trigger audit_log_no_update;
  alter table audit_details enable trigger audit_details_no_update;
end $$;
commit;
