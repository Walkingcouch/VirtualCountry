-- Monitoring that never sees content (18 November 2026). Additive: nothing is dropped.
--  1. The governance chain of every organisation is checked every night. Administrators and Cultural Authorities see the latest result.
--  2. Screens that fail record the kind of screen, the error type and the app version. Never a message, a name or content.

-- ---------- 1. Nightly chain check ----------
create or replace function vc_chain_status(p_org uuid) returns table (ok boolean, entries integer, head text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_prev text := 'genesis'; v_ok boolean := true; v_n int := 0;
begin
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

create or replace function verify_audit_chain(p_org uuid) returns table (ok boolean, entries integer, head text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not vc_is_member(p_org) then raise exception 'not a member'; end if;
  return query select * from vc_chain_status(p_org);
end $$;

create table if not exists chain_checks (
  id bigserial primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  entries integer not null,
  head text not null
);
create index if not exists chain_checks_org_idx on chain_checks (org_id, checked_at desc);
alter table chain_checks enable row level security;
revoke all on chain_checks from anon, authenticated;
grant select on chain_checks to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chain_checks' and policyname = 'chain_checks_select') then
    create policy chain_checks_select on chain_checks for select to authenticated
      using (vc_is_admin(org_id) or vc_is_ca(org_id, (select auth.uid())));
  end if;
end $$;

create or replace function vc_check_all_chains() returns integer
language plpgsql security definer set search_path = public as $$
declare o record; s record; n integer := 0;
begin
  for o in select id from orgs loop
    select * into s from vc_chain_status(o.id);
    insert into chain_checks (org_id, ok, entries, head) values (o.id, s.ok, s.entries, s.head);
    if not s.ok then raise warning 'Governance chain broken for organisation %', o.id; end if;
    n := n + 1;
  end loop;
  delete from chain_checks where checked_at < now() - interval '400 days';
  return n;
end $$;

create extension if not exists pg_cron;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'vc-nightly-chain-check') then
    perform cron.unschedule('vc-nightly-chain-check');
  end if;
  -- 17:17 UTC is 2:47 am in Darwin.
  perform cron.schedule('vc-nightly-chain-check', '17 17 * * *', 'select public.vc_check_all_chains()');
end $$;

-- ---------- 2. Screen errors, without content ----------
create table if not exists client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  route text not null check (char_length(route) <= 120 and route !~ '[0-9a-f]{8}-[0-9a-f]{4}-'),
  kind text not null check (char_length(kind) <= 60 and kind ~ '^[A-Za-z][A-Za-z0-9_.]*$'),
  digest text check (digest is null or (char_length(digest) <= 40 and digest ~ '^[A-Za-z0-9_-]+$')),
  version text not null check (char_length(version) <= 20 and version ~ '^[0-9][0-9.]*$')
);
create index if not exists client_errors_at_idx on client_errors (at desc);
alter table client_errors enable row level security;
revoke all on client_errors from anon, authenticated;
grant insert (route, kind, digest, version) on client_errors to anon, authenticated;
grant usage on sequence client_errors_id_seq to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_errors' and policyname = 'client_errors_insert') then
    create policy client_errors_insert on client_errors for insert to anon, authenticated with check (true);
  end if;
end $$;

-- A flood of reports is dropped quietly rather than filling the table.
create or replace function vc_limit_client_errors() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors where at > now() - interval '1 minute') >= 120 then return null; end if;
  return new;
end $$;
create or replace trigger client_errors_limit before insert on client_errors for each row execute function vc_limit_client_errors();

revoke execute on function vc_chain_status(uuid), vc_check_all_chains(), vc_limit_client_errors() from public, anon, authenticated;
