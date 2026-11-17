# Database

The migrations in `migrations/` build the schema. Apply them in file-name order. Every one is additive: nothing is dropped.

| File | What it adds |
|---|---|
| `20261012000000_core.sql` | Tables |
| `20261012000100_security.sql` | Row level security, helper functions, RPCs, audit hash chain, permissions, the `media` bucket |
| `20261016000000_review_fixes.sql` | Changing access after saving, legacy access, two-signature Cultural Authority appointment, log detail |
| `20261017000000_orgs_admins_bridges.sql` | Starting an organisation, administrators, bridge requests |
| `20261116000000_audit_hardening.sql` | Active membership behind every power, membership guard and log, keys follow the signed list, releases stay in the item's community, groups, `delete_item`, least-privilege grants |
| `20261117000000_readiness.sql` | Item access needs active membership, `create_conversation`, bridge sync for new administrators, limits, indexes |
| `20261117000100_rejoin.sql` | Asking to join again after leaving or being removed |

`seed.sql` loads the invented Demo Country data. It is generated with real keys and real encryption by `npm run seed:sql`.

## New Supabase project

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                       # applies every migration
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

## Security suite

`tests/security.sql` acts as each kind of person (visitor, outsider, pending member, member, administrator without content keys, Cultural Authority, removed member, removed Cultural Authority, partner administrator) and tries 74 things. Each attempt is rolled back, so nothing is kept. Paste it into the SQL editor of the **demo** project. The last statement lists every test; every row must show `ok = true`.

It needs the demo people from `seed.sql`, so it runs on demo and staging databases only.

## Resetting the demo

```bash
DATABASE_URL=<demo connection string> npm run demo:reset
```

Removes the two demo organisations and the six demo people, then loads `seed.sql` again. It asks for a typed confirmation first. Never run it against production.

## Rules for new migrations

- New file, never edit an applied one. Nothing is dropped.
- Every new table gets row level security and grants only what the app uses. Updates are granted column by column.
- Every new function: `set search_path`, `revoke execute ... from public, anon`, and grant to `authenticated` only if the app calls it or a policy uses it.
- Try the migration in a transaction that is rolled back, then apply it, then run the security suite and the advisors.
