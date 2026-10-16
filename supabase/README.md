# Database

Two migrations build the schema:

- `migrations/20261012000000_core.sql`: tables
- `migrations/20261012000100_security.sql`: row level security, helper functions, RPCs, audit hash chain, permissions

`seed.sql` loads the invented Demo Country data. It is generated with real keys and real encryption by `npm run seed:sql`.

## New Supabase project

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                       # applies both migrations
psql "$DATABASE_URL" -f supabase/seed.sql  # or paste into the SQL editor
```

The security migration also creates the private Storage bucket `media` and its policies.

## Local stack

```bash
npx supabase start
npx supabase db reset    # migrations and seed.sql
```

Then point `.env.local` at the local URL and anon key that `supabase start` prints.

## Checks

```sql
select * from verify_audit_chain('f5d2bb46-a7d2-4ec5-8cc5-d735881accc0');
```

Should return `ok = true`. Run the Supabase security advisors after any schema change.
