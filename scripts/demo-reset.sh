#!/usr/bin/env bash
# Resets the invented Demo Country data: clears it, then loads supabase/seed.sql again.
# Needs DATABASE_URL (the Postgres connection string of the DEMO project) and psql.
# It refuses to run unless you type the confirmation, and it stops on the first error.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to the demo database connection string first." >&2
  exit 1
fi
command -v psql >/dev/null || { echo "psql is not installed." >&2; exit 1; }

host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
real="$(psql "$DATABASE_URL" -At -c "select count(*) from auth.users where email not like '%.demo@example.com'")"
echo "Target database host: $host"
echo "Accounts that are not demo people: $real (these are kept)"
echo "This deletes Demo Country and Demo University (partner) and everything in them, then loads the seed again."
read -r -p "Type RESET DEMO to continue: " answer
[[ "$answer" == "RESET DEMO" ]] || { echo "Stopped. Nothing was changed."; exit 1; }

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/demo_reset.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$DATABASE_URL" -At -c "select 'Governance chain ok: ' || ok from verify_audit_chain((select id from orgs where name = 'Demo Country'))"
echo "Demo reset finished."
