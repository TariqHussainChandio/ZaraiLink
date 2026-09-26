#!/usr/bin/env bash
# Encrypted logical backup of a Postgres database (P6 item 6).
#
#   DATABASE_URL=postgresql://... AGE_RECIPIENT=age1... scripts/db/backup.sh out.dump.age
#
# pg_dump (custom format, so pg_restore can restore selectively) is piped straight into `age`, so the plaintext
# dump exists only in the pipe, never on disk. Only the holder of the matching private key can decrypt the file,
# which is what makes it safe to keep as a CI artifact even in a public repository.
#
# Covers the public, auth and storage schemas: application data, users (password hashes included, hence the
# encryption) and the storage object index. It does NOT contain the files themselves: uploaded images and
# documents live in object storage, not in Postgres, and are not part of this backup.
#
# pg_dump runs from the same Supabase Postgres image the project uses, so its version is never older than the
# server's. On a Linux runner reaching a host-local database add PG_DOCKER_ARGS="--network host"; for the local
# Supabase stack use PG_DOCKER_ARGS="--network container:supabase_db_ZaraiLink_V1" and a localhost URL.
set -euo pipefail

OUT="${1:?usage: backup.sh <out-file.dump.age>}"
: "${DATABASE_URL:?set DATABASE_URL}"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to the age public key (age1...)}"
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.155}"
AGE_IMAGE="${AGE_IMAGE:-alpine:3.20}"
# shellcheck disable=SC2086  # PG_DOCKER_ARGS is deliberately word-split
docker run --rm -i ${PG_DOCKER_ARGS:-} "$PG_IMAGE" pg_dump \
  --format=custom --no-owner \
  --schema=public --schema=auth --schema=storage \
  "$DATABASE_URL" \
  | docker run --rm -i "$AGE_IMAGE" sh -c 'apk add -q --no-cache age >/dev/null 2>&1 && age -r "$0"' "$AGE_RECIPIENT" \
  > "$OUT"

# An empty or tiny file means the dump failed part-way; pipefail catches the exit status, this catches the rest.
SIZE="$(wc -c < "$OUT")"
if [ "$SIZE" -lt 1024 ]; then
  echo "backup is suspiciously small ($SIZE bytes)" >&2
  exit 1
fi
echo "backup written: $OUT ($SIZE bytes, encrypted to $AGE_RECIPIENT)"
