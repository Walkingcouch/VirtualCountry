-- Virtual Country: core schema (Part F, F5–F6)
-- Content is encrypted on people's devices. The database only ever sees ciphertext,
-- key envelopes sealed for individual people, signatures and minimal routing metadata.
-- Every table has Row Level Security, deny by default.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- Identity
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.public_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enc_pk text not null,          -- X25519 public key (base64)
  sign_pk text not null,         -- Ed25519 public key (base64)
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- The person's encrypted key vault. Only its owner can read it.
-- amk_pin: Account Master Key wrapped by the person's passphrase (Argon2id)
-- amk_recovery: the same key wrapped by the recovery code
-- identity: identity secret keys encrypted with the Account Master Key
create table public.vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  amk_pin jsonb not null,
  amk_recovery jsonb not null,
  identity jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Organisations (a community space, a partner, a school)
-- ============================================================
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('community','partner','school')),
  founding_ca uuid references auth.users(id),   -- trust anchor (set in person at set-up)
  storage_option text not null default 'cloud' check (storage_option in ('cloud','mixed','local')),
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','removed')),
  is_admin boolean not null default false,
  content_member boolean not null default true,  -- false = administrator only: receives no content keys
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  requested_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.org_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  ai_help boolean not null default true,
  ai_curator boolean not null default false,
  idle_lock_minutes int not null default 10 check (idle_lock_minutes between 2 and 60),
  public_blur_percent int not null default 10 check (public_blur_percent between 1 and 50)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  kind text not null default 'custom' check (kind in ('family','school','rangers','custom')),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Signed cultural standings and roles (E6). Clients verify every signature.
create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  claim text not null check (claim in ('standing:women','standing:men','role:cultural_authority','role:recovery_keeper')),
  issuer_id uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  sig text not null,
  revoked_at timestamptz
);
create index on public.attestations (org_id, subject_id);

create table public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ============================================================
-- Content
-- ============================================================
create table public.items (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  holder_id uuid not null references auth.users(id),
  current_version int not null default 1,
  paused boolean not null default false,   -- sorry business: only the holder holds a key
  sacred boolean not null default false,   -- can never be released, exported or used by AI
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.items (org_id);

create table public.item_versions (
  item_id uuid not null references public.items(id) on delete cascade,
  version int not null,
  nonce text not null,
  ciphertext text not null,
  ct_hash text not null,
  recipients uuid[] not null,
  recipients_hash text not null,
  author_id uuid not null references auth.users(id),
  author_sig text not null,
  created_at timestamptz not null default now(),
  primary key (item_id, version)
);

-- Key envelopes: the item key sealed for one person. No envelope, no access.
create table public.item_keys (
  item_id uuid not null,
  version int not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sealed_key text not null,
  primary key (item_id, version, recipient_id),
  foreign key (item_id, version) references public.item_versions(item_id, version) on delete cascade
);
create index on public.item_keys (recipient_id);

-- ============================================================
-- Public release (D5)
-- ============================================================
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_item_id uuid not null references public.items(id),
  title text not null check (char_length(title) <= 140),
  summary text not null check (char_length(summary) <= 4000),
  place_label text not null default '',
  blur_x int,     -- generalised location on the community map (grid cell centre)
  blur_y int,
  labels text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','published','withdrawn','rejected')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  signer_id uuid references auth.users(id),
  sig text,
  published_at timestamptz,
  withdrawn_at timestamptz
);

-- ============================================================
-- Messaging (D12): same-organisation chats, and administrator bridges
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,  -- null only for bridges
  kind text not null check (kind in ('group','direct','bridge')),
  title text not null,
  created_by uuid not null references auth.users(id),
  key_version int not null default 1,
  created_at timestamptz not null default now(),
  check ((kind = 'bridge') = (org_id is null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.conversation_keys (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  key_version int not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sealed_key text not null,
  primary key (conversation_id, key_version, recipient_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  key_version int not null,
  nonce text not null,
  ciphertext text not null,
  sig text not null,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

create table public.bridges (
  id uuid primary key default gen_random_uuid(),
  org_a uuid not null references public.orgs(id) on delete cascade,
  org_b uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  approved_a_by uuid references auth.users(id),
  approved_b_by uuid references auth.users(id),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  check (org_a <> org_b)
);

-- ============================================================
-- Tamper-evident logs (E8). Actions only, never content.
-- ============================================================
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  at timestamptz not null default now(),
  prev_hash text not null,
  hash text not null
);
create index on public.audit_log (org_id, id);
