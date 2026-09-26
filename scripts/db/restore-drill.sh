#!/usr/bin/env bash
# Restore drill (P6 item 6): prove an encrypted backup can actually be restored, and that what comes back
# matches the source.
#
#   AGE_IDENTITY=path/to/private.key DATABASE_URL=postgresql://... scripts/db/restore-drill.sh backup.dump.age
#
# 1. decrypts the backup (the private key is read from a file and never printed);
# 2. starts a scratch Postgres (same image as the project, so auth and storage already exist, as they do in a
#    fresh Supabase project) and restores over it with pg_restore --clean; errors about objects the image owns
#    are logged and tolerated, because step 3 is the real test;
# 3. compares the source and the restored copy: for every table in public, auth and storage the exact row count AND
#    a checksum of the rows' contents, plus a checksum of every policy definition and every public function. A restore
#    that has the right number of rows with wrong values, or a policy with the right name and a different rule, fails.
# Exit status 0 only if everything matches. The scratch container is removed on exit; on failure the logs and the
# two comparison files are kept in a temporary directory whose path is printed.
#
# Both sides are queried with search_path = pg_catalog so expression text prints identically (unqualified names
# would otherwise print with or without a schema depending on the session).
#
# Needs the same PG_DOCKER_ARGS as backup.sh to reach the source database.
set -euo pipefail

BACKUP="${1:?usage: restore-drill.sh <backup.dump.age>}"
: "${AGE_IDENTITY:?set AGE_IDENTITY to the age private key file}"
: "${DATABASE_URL:?set DATABASE_URL to the source database (for the comparison)}"
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.155}"
AGE_IMAGE="${AGE_IMAGE:-alpine:3.20}"
SCRATCH="restore-drill-$$"
DEBRIS="$(mktemp -d)"

cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# One line per table: "schema.table <row count> <md5 of the sorted per-row md5s>". Hashing each row's text form
# and sorting the hashes makes the checksum independent of physical row order.
TABLE_SQL="select table_schema || '.' || table_name || ' ' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text || ' ' ||
  (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(md5(t::text), '''' order by md5(t::text)), '''')) as h from %I.%I t', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_schema in ('public', 'auth', 'storage') and table_type = 'BASE TABLE' order by 1"
DEF_SQL="select 'policy-definitions ' || count(*) || ' ' || coalesce(md5(string_agg(schemaname || '.' || tablename || '.' || policyname || ' ' || cmd || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname)), '')
  from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'public-functions ' || count(*) || ' ' || coalesce(md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text)), '')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'"

echo "starting scratch database $SCRATCH"
docker run -d --name "$SCRATCH" -e POSTGRES_PASSWORD=drill "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$SCRATCH" pg_isready -U postgres -q 2>/dev/null; then break; fi
  sleep 1
done
docker exec "$SCRATCH" pg_isready -U postgres -q

echo "decrypting and restoring"
docker run --rm -i -v "$AGE_IDENTITY":/key:ro "$AGE_IMAGE" \
  sh -c 'apk add -q --no-cache age >/dev/null 2>&1 && age -d -i /key' < "$BACKUP" \
  | docker exec -i "$SCRATCH" pg_restore -U supabase_admin -d postgres --no-owner --clean --if-exists 2>"$DEBRIS/restore.log" \
  || { echo "pg_restore reported problems; see $DEBRIS/restore.log" >&2; }

query_source() {
  # shellcheck disable=SC2086
  docker run --rm ${PG_DOCKER_ARGS:-} "$PG_IMAGE" psql "$DATABASE_URL" -q -At -c "set search_path = pg_catalog" -c "$1"
}
query_scratch() { docker exec "$SCRATCH" psql -U supabase_admin -d postgres -q -At -c "set search_path = pg_catalog" -c "$1"; }

{ query_source "$TABLE_SQL"; query_source "$DEF_SQL"; } > "$DEBRIS/source.txt"
{ query_scratch "$TABLE_SQL"; query_scratch "$DEF_SQL"; } > "$DEBRIS/restored.txt"

if diff -u "$DEBRIS/source.txt" "$DEBRIS/restored.txt"; then
  TABLES="$(grep -vc '^policy-definitions\|^public-functions' "$DEBRIS/source.txt")"
  ROWS="$(grep -v '^policy-definitions\|^public-functions' "$DEBRIS/source.txt" | awk '{s += $2} END {print s}')"
  echo "RESTORE DRILL PASSED: $TABLES tables, $ROWS rows, row contents, policies and functions all match"
  rm -rf "$DEBRIS"
else
  echo "RESTORE DRILL FAILED: the restored database differs from the source (diff above). Kept for inspection: $DEBRIS" >&2
  exit 1
fi
