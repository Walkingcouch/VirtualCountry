-- Virtual Country security suite. Run against the demo database only.
-- Each test acts as one demo person, tries one thing, and is rolled back straight away, so nothing is kept.
-- "deny" passes when the attempt fails or touches no rows. "allow" passes when it works.
-- The last statement lists every test. Any row with ok = false is a defect.
create temp table if not exists vc_sec (n int, test text, expect text, ok boolean, note text);
do $suite$
declare
  demo uuid := (select id from orgs where name = 'Demo Country');
  uni  uuid := (select id from orgs where name = 'Demo University (partner)');
  rose uuid := (select id from auth.users where email = 'rose.demo@example.com');
  tom  uuid := (select id from auth.users where email = 'tom.demo@example.com');
  maya uuid := (select id from auth.users where email = 'maya.demo@example.com');
  dan  uuid := (select id from auth.users where email = 'daniel.demo@example.com');
  sam  uuid := (select id from auth.users where email = 'sam.demo@example.com');
  lee  uuid := (select id from auth.users where email = 'lee.demo@example.com');
  womens uuid := (select i.id from items i join item_versions v on v.item_id = i.id and v.version = i.current_version
                  where i.holder_id = rose and not i.paused and not i.sacred and v.recipients @> array[maya] and not v.recipients @> array[dan] limit 1);
  mens   uuid := (select i.id from items i join item_versions v on v.item_id = i.id and v.version = i.current_version
                  where i.holder_id = tom and not v.recipients @> array[rose] limit 1);
  dans   uuid := (select i.id from items i where i.holder_id = dan and not i.sacred and not i.paused and i.current_version = 1
                  and not exists (select 1 from releases r where r.source_item_id = i.id and r.status = 'pending') limit 1);
  sacred uuid := (select id from items where holder_id = rose and sacred limit 1);
  chat   uuid := (select c.id from conversations c where c.kind = 'group' and c.org_id = demo
                  and (select count(*) from conversation_members m where m.conversation_id = c.id) >= 5 limit 1);
  bridge uuid := (select conversation_id from bridges where status = 'active' limit 1);
  rangers uuid := (select id from groups where org_id = demo and name like 'Rangers%');
  att uuid := (select id from attestations where org_id = demo and revoked_at is null and claim like 'standing:%' limit 1);
  rel constant uuid := '00000000-0000-4000-8000-0000000000aa';
  t record; n int; ok boolean; note text; i int := 0;
begin
  delete from vc_sec;
  for t in select * from (values
    -- visitor (not signed in)
    ('visitor cannot read items', null::uuid, '', 'select count(*) from items', 'deny'),
    ('visitor cannot read vaults', null, '', 'select count(*) from vaults', 'deny'),
    ('visitor cannot read members', null, '', 'select count(*) from org_members', 'deny'),
    ('visitor cannot list public keys of non-signers', null, '', 'select count(*) from public_keys where user_id not in (select signer_id from releases where status = ''published'')', 'deny'),
    ('visitor cannot call internal functions', null, '', format('select count(*) from vc_item_access_detail(%L, 1, 1)', womens), 'deny'),
    ('visitor can read published releases', null, '', 'select count(*) from releases where status = ''published''', 'allow'),
    -- outsider and new sign-up (signed in, not in Demo Country)
    ('outsider cannot read items', lee, '', format('select count(*) from items where org_id = %L', demo), 'deny'),
    ('outsider cannot read item text', lee, '', format('select count(*) from item_versions where item_id = %L', womens), 'deny'),
    ('outsider cannot read members', lee, '', format('select count(*) from org_members where org_id = %L and user_id <> %L', demo, lee), 'deny'),
    ('outsider cannot read standings', lee, '', format('select count(*) from attestations where org_id = %L', demo), 'deny'),
    ('outsider cannot read the log', lee, '', format('select count(*) from audit_log where org_id = %L', demo), 'deny'),
    ('outsider cannot read community chat', lee, '', format('select count(*) from messages where conversation_id = %L', chat), 'deny'),
    ('outsider cannot fetch a stranger''s public key', lee, '', format('select count(*) from public_keys where user_id = %L', maya), 'deny'),
    ('outsider cannot join as active', lee, '', format('with x as (insert into org_members (org_id, user_id, status) values (%L, %L, ''active'') returning 1) select count(*) from x', demo, lee), 'deny'),
    ('outsider cannot join as administrator', lee, '', format('with x as (insert into org_members (org_id, user_id, status, is_admin) values (%L, %L, ''pending'', true) returning 1) select count(*) from x', demo, lee), 'deny'),
    ('outsider can ask to join', lee, '', format('with x as (insert into org_members (org_id, user_id, status) values (%L, %L, ''pending'') returning 1) select count(*) from x', demo, lee), 'allow'),
    ('pending member cannot read items or the log', lee, format('insert into org_members (org_id, user_id, status) values (%L, %L, ''pending'')', demo, lee),
       format('select (select count(*) from items where org_id = %1$L) + (select count(*) from audit_log where org_id = %1$L)', demo), 'deny'),
    ('nobody can call the old one-step bridge function', lee, '', format('select count(*) from (select create_bridge(%L, %L, %L, ''x'')) s', uni, demo, lee), 'deny'),
    -- member
    ('member cannot read an item not shared with them', dan, '', format('select count(*) from item_versions where item_id = %L', womens), 'deny'),
    ('member cannot see other people''s sealed keys', dan, '', format('select count(*) from item_keys k join items i on i.id = k.item_id where k.recipient_id <> %1$L and i.holder_id <> %1$L', dan), 'deny'),
    ('member cannot make themselves administrator', dan, '', format('with x as (update org_members set is_admin = true where user_id = %L returning 1) select count(*) from x', dan), 'deny'),
    ('member cannot confirm cultural standing', dan, '', format('with x as (insert into attestations (org_id, subject_id, claim, issuer_id, sig) values (%L, %L, ''standing:men'', %L, ''x'') returning 1) select count(*) from x', demo, dan, dan), 'deny'),
    ('member cannot sign their own release', dan, format('insert into releases (id, org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, %L, ''t'', ''s'', ''p'', ''pending'', %L)', rel, demo, dans, dan),
       format('select count(*) from (select sign_release(%L, ''x'')) s', rel), 'deny'),
    ('member cannot edit the log', dan, '', 'with x as (update audit_log set action = ''x'' returning 1) select count(*) from x', 'deny'),
    ('member cannot delete from the log', dan, '', 'with x as (delete from audit_log returning 1) select count(*) from x', 'deny'),
    ('member cannot empty a table', dan, '', 'truncate messages', 'deny'),
    ('holder cannot seal a key to someone off the signed list', dan, '', format('with x as (insert into item_keys (item_id, version, recipient_id, sealed_key) values (%L, 1, %L, ''x'') returning 1) select count(*) from x', dans, sam), 'deny'),
    ('holder cannot release through another organisation', dan, '', format('with x as (insert into releases (org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, ''t'', ''s'', ''p'', ''pending'', %L) returning 1) select count(*) from x', uni, dans, dan), 'deny'),
    ('holder can draft a release in their own community', dan, '', format('with x as (insert into releases (org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, ''t'', ''s'', ''p'', ''pending'', %L) returning 1) select count(*) from x', demo, dans, dan), 'allow'),
    ('holder cannot skip version numbers', dan, '', format('select count(*) from (select save_item(%L, %L, 5, ''n'', ''c'', ''h'', array[%L]::uuid[], ''h'', ''s'', ''[]''::jsonb, false, false)) s', dans, demo, dan), 'deny'),
    ('holder can save the next version', dan, '', format('select count(*) from (select save_item(%1$L, %2$L, 2, ''n'', ''c'', ''h'', array[%3$L]::uuid[], ''h'', ''s'', jsonb_build_array(jsonb_build_object(''recipient_id'', %3$L, ''sealed_key'', ''k'')), false, false)) s', dans, demo, dan), 'allow'),
    ('holder cannot rewrite a saved version', dan, '', format('with x as (update item_versions set ciphertext = ''x'' where item_id = %L returning 1) select count(*) from x', dans), 'deny'),
    ('member cannot change someone else''s item', dan, '', format('with x as (update items set paused = true where id = %L returning 1) select count(*) from x', womens), 'deny'),
    ('member cannot delete someone else''s item', dan, '', format('select count(*) from (select delete_item(%L)) s', womens), 'deny'),
    ('holder can delete their own item', dan, '', format('select count(*) from (select delete_item(%L)) s', dans), 'allow'),
    ('member cannot read another vault', dan, '', format('select count(*) from vaults where user_id = %L', rose), 'deny'),
    ('member cannot add themselves to a group', dan, '', format('with x as (insert into group_members (group_id, user_id) values (%L, %L) on conflict do nothing returning 1) select count(*) from x', (select id from groups where org_id = demo and name like 'School%'), dan), 'deny'),
    ('member can read and send in their chat', dan, '', format('with x as (insert into messages (conversation_id, sender_id, key_version, nonce, ciphertext, sig) values (%L, %L, 1, ''n'', ''c'', ''s'') returning 1) select (select count(*) from x) * (select count(*) from messages where conversation_id = %1$L)', chat, dan), 'allow'),
    ('member can open what is shared with them', maya, '', format('select count(*) from item_versions v join item_keys k on k.item_id = v.item_id and k.version = v.version where v.item_id = %L and k.recipient_id = %L', womens, maya), 'allow'),
    ('member can start a chat in one step', dan, '', format('select count(*) from (select create_conversation(gen_random_uuid(), %L, ''Test'', array[%L]::uuid[], jsonb_build_array(jsonb_build_object(''recipient_id'', %L, ''sealed_key'', repeat(''k'', 40)), jsonb_build_object(''recipient_id'', %L, ''sealed_key'', repeat(''k'', 40))))) s', demo, tom, dan, tom), 'allow'),
    ('member cannot pull an outsider into a chat', dan, '', format('select count(*) from (select create_conversation(gen_random_uuid(), %L, ''Test'', array[%L]::uuid[], jsonb_build_array(jsonb_build_object(''recipient_id'', %L, ''sealed_key'', repeat(''k'', 40)), jsonb_build_object(''recipient_id'', %L, ''sealed_key'', repeat(''k'', 40))))) s', demo, lee, dan, lee), 'deny'),
    ('member can update their own vault and profile', rose, '', format('with a as (update vaults set updated_at = now() where user_id = %1$L returning 1), b as (insert into profiles (id, display_name) values (%1$L, ''Rose'') on conflict (id) do update set display_name = excluded.display_name returning 1) select (select count(*) from a) * (select count(*) from b)', rose), 'allow'),
    -- administrator without content keys
    ('administrator cannot read item text', sam, '', 'select count(*) from item_versions', 'deny'),
    ('administrator cannot give themselves content keys', sam, '', format('with x as (update org_members set content_member = true where user_id = %L and org_id = %L returning 1) select count(*) from x', sam, demo), 'deny'),
    ('administrator cannot fake who approved a member', sam, format('insert into org_members (org_id, user_id, status) values (%L, %L, ''pending'')', demo, lee),
       format('with x as (update org_members set status = ''active'', approved_by = %L where org_id = %L and user_id = %L returning approved_by) select count(*) from x where approved_by <> %L', rose, demo, lee, sam), 'deny'),
    ('administrator can approve a member', sam, format('insert into org_members (org_id, user_id, status) values (%L, %L, ''pending'')', demo, lee),
       format('with x as (update org_members set status = ''active'' where org_id = %L and user_id = %L returning 1) select count(*) from x', demo, lee), 'allow'),
    ('administrator cannot add an outsider to a group', sam, '', format('with x as (insert into group_members (group_id, user_id) values (%L, %L) returning 1) select count(*) from x', rangers, lee), 'deny'),
    ('administrator can add a member to a group', sam, '', format('with x as (insert into group_members (group_id, user_id) values (%L, %L) on conflict do nothing returning 1) select count(*) from x', rangers, maya), 'allow'),
    ('administrator cannot confirm cultural standing', sam, '', format('with x as (insert into attestations (org_id, subject_id, claim, issuer_id, sig) values (%L, %L, ''standing:women'', %L, ''x'') returning 1) select count(*) from x', demo, maya, sam), 'deny'),
    ('last administrator cannot step down', sam, '', format('with x as (update org_members set is_admin = false where user_id = %L and org_id = %L returning 1) select count(*) from x', sam, demo), 'deny'),
    ('administrator cannot move a membership', sam, '', format('with x as (update org_members set user_id = %L where user_id = %L returning 1) select count(*) from x', lee, dan), 'deny'),
    ('administrator can read log detail and change settings', sam, '', format('with x as (update org_settings set idle_lock_minutes = 12 where org_id = %L returning 1) select (select count(*) from x) * (select count(*) from audit_details where org_id = %1$L)', demo), 'allow'),
    ('administrator can list bridges', sam, '', format('select count(*) from list_bridges_v2(%L)', demo), 'allow'),
    -- Cultural Authority
    ('Cultural Authority cannot appoint themselves', rose, '', format('with x as (insert into attestations (org_id, subject_id, claim, issuer_id, sig) values (%L, %L, ''role:cultural_authority'', %L, ''x'') returning 1) select count(*) from x', demo, rose, rose), 'deny'),
    ('Cultural Authority cannot release sacred material', rose, format('insert into releases (id, org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, %L, ''t'', ''s'', ''p'', ''pending'', %L)', rel, demo, sacred, rose),
       format('select count(*) from (select sign_release(%L, ''x'')) s', rel), 'deny'),
    ('Cultural Authority cannot restore a removed standing', rose, format('update attestations set revoked_at = now() where id = %L', att),
       format('with x as (update attestations set revoked_at = null where id = %L returning 1) select count(*) from x', att), 'deny'),
    ('Cultural Authority cannot rewrite a standing', rose, '', format('with x as (update attestations set subject_id = %L where id = %L returning 1) select count(*) from x', dan, att), 'deny'),
    ('Cultural Authority cannot read an item not shared with them', rose, '', format('select count(*) from item_versions where item_id = %L', mens), 'deny'),
    ('Cultural Authority can sign a waiting release', rose, format('insert into releases (id, org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, %L, ''t'', ''s'', ''p'', ''pending'', %L)', rel, demo, dans, dan),
       format('select count(*) from (select sign_release(%L, ''x'')) s', rel), 'allow'),
    ('Cultural Authority can confirm and read the directory', rose, '', format('with x as (insert into attestations (org_id, subject_id, claim, issuer_id, sig) values (%1$L, %2$L, ''role:recovery_keeper'', %3$L, ''x'') returning 1) select (select count(*) from x) * (select count(*) from org_directory(%1$L))', demo, dan, rose), 'allow'),
    -- removed member
    ('removed member cannot read chats', maya, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', maya, demo), format('select count(*) from messages where conversation_id = %L', chat), 'deny'),
    ('removed member cannot send messages', maya, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', maya, demo),
       format('with x as (insert into messages (conversation_id, sender_id, key_version, nonce, ciphertext, sig) values (%L, %L, 1, ''n'', ''c'', ''s'') returning 1) select count(*) from x', chat, maya), 'deny'),
    ('removed member cannot fetch items shared with them', maya, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', maya, demo),
       format('select (select count(*) from item_versions where item_id = %1$L) + (select count(*) from item_keys where item_id = %1$L) + (select count(*) from items where id = %1$L)', womens), 'deny'),
    ('removed member cannot read the directory or log', maya, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', maya, demo),
       format('select (select count(*) from org_directory(%1$L)) + (select count(*) from audit_log where org_id = %1$L)', demo), 'deny'),
    -- removed Cultural Authority
    ('removed Cultural Authority cannot reject a release', tom, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L; insert into releases (id, org_id, source_item_id, title, summary, place_label, status, created_by) values (%L, %L, %L, ''t'', ''s'', ''p'', ''pending'', %L)', tom, demo, rel, demo, dans, dan),
       format('select count(*) from (select reject_release(%L)) s', rel), 'deny'),
    ('removed Cultural Authority cannot remove a standing', tom, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', tom, demo),
       format('with x as (update attestations set revoked_at = now() where id = %L returning 1) select count(*) from x', att), 'deny'),
    ('removed Cultural Authority cannot read log detail', tom, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', tom, demo),
       format('select count(*) from audit_details where org_id = %L', demo), 'deny'),
    ('the only Cultural Authority cannot be removed', sam, format('update org_members set status = ''removed'' where user_id = %L and org_id = %L', tom, demo),
       format('with x as (update org_members set status = ''removed'' where user_id = %L and org_id = %L returning 1) select count(*) from x', rose, demo), 'deny'),
    -- partner organisation administrator
    ('partner administrator can read the bridge', lee, '', format('select count(*) from messages where conversation_id = %L', bridge), 'allow'),
    ('partner administrator cannot read community chat', lee, '', format('select count(*) from messages where conversation_id = %L', chat), 'deny'),
    ('nobody can write to a closed bridge', lee, format('update bridges set status = ''closed'' where conversation_id = %L', bridge),
       format('with x as (insert into messages (conversation_id, sender_id, key_version, nonce, ciphertext, sig) values (%L, %L, 1, ''n'', ''c'', ''s'') returning 1) select count(*) from x', bridge, lee), 'deny'),
    ('administrator cannot accept their own bridge request', lee, format('update bridges set status = ''closed'' where conversation_id = %L; insert into bridge_requests (id, org_a, org_b, requested_by) values (%L, %L, %L, %L)', bridge, rel, uni, demo, lee),
       format('select count(*) from (select bridge_action(%L, ''accept'')) s', rel), 'deny'),
    ('former administrator loses the bridge', sam, format('update org_members set is_admin = true where user_id = %L and org_id = %L; update org_members set is_admin = false where user_id = %L and org_id = %L', rose, demo, sam, demo),
       format('select count(*) from messages where conversation_id = %L', bridge), 'deny'),
    ('new administrator joins the bridge', rose, format('update org_members set is_admin = true where user_id = %L and org_id = %L', rose, demo),
       format('select count(*) from conversation_members where conversation_id = %L and user_id = %L', bridge, rose), 'allow')
  ) v(name, actor, setup, q, expect) loop
    i := i + 1; n := null; note := '';
    begin
      if t.setup <> '' then execute t.setup; end if;
      if t.actor is null then
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        execute 'set local role anon';
      else
        perform set_config('request.jwt.claims', json_build_object('sub', t.actor, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
      end if;
      begin
        execute t.q into n;
        if n is null then n := 1; end if;
      exception when others then n := -1; note := left(sqlerrm, 90);
      end;
      raise exception using errcode = 'VC001', message = 'roll back this test';
    exception when sqlstate 'VC001' then null;
      when others then n := -2; note := 'set-up failed: ' || left(sqlerrm, 90);
    end;
    ok := case when n = -2 then false when t.expect = 'allow' then coalesce(n, 0) > 0 else coalesce(n, 0) <= 0 end;
    insert into vc_sec values (i, t.name, t.expect, ok, note);
  end loop;
end $suite$;
select n, test, expect, ok, note from vc_sec order by ok, n;
