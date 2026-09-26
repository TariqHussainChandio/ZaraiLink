# Integration Brief: Nightly encrypted database backup (gate G3, plan P6 item 6)

Status: **waiting for the maintainer.** The mechanism is built and proven locally (phase P6); the one step that
needs the maintainer is giving it the hosted project's connection string and an encryption key.

```
Service and purpose:           A nightly copy of the hosted Supabase database (public, auth and storage
                               schemas), kept where the maintainer can restore it. The free plan has no
                               backups, so today one bad migration or a paused/deleted project loses
                               everything (plan risk table).

Options considered:
  1. Encrypted GitHub Actions   pg_dump encrypted with `age` to the maintainer's public key, uploaded as a
     artifact (chosen)          workflow artifact, 90-day retention. No new provider or account. Safe in a
                                public repository because the artifact is ciphertext and the private key never
                                leaves the maintainer. Limits: 90 days, 500 MB/artifact on free plans.
  2. Cloudflare R2 / Backblaze  Longer retention, independent of GitHub. Needs a new account, a private
     B2 bucket                  bucket and keys. Reasonable later if 90 days is too short.
  3. Supabase Pro backups       Daily physical backups, 7-day retention, point-in-time option, $25/month.
                                The cleanest answer if the project goes to production.
  4. Nothing                    Data loss is one mistake away.

Recommendation and why:        Option 1 now (free, no account), with option 3 when the app has real users.

What YOU (the maintainer) must do:
                               1. On your own machine generate a key pair and keep the PRIVATE key offline
                                  (password manager plus a printed copy). Never put it in GitHub, chat or git:
                                    docker run --rm alpine:3.20 sh -c 'apk add -q age && age-keygen'
                                  The line starting `age1...` is the public key; the line starting
                                  `AGE-SECRET-KEY-` is the private one.
                               2. GitHub, Settings, Environments: create an environment named `backup`
                                  (optionally require your approval). Add the secret DATABASE_URL: the
                                  Supabase "Session pooler" connection string (Project Settings, Database,
                                  Connection string, Session pooler) with your database password. Use the
                                  pooler, not the direct host: the direct host is IPv6-only on the free plan
                                  and GitHub runners are IPv4.
                               3. Settings, Secrets and variables, Variables: add BACKUP_AGE_RECIPIENT set to
                                  the `age1...` public key.
                               4. Actions, "Database backup", Run workflow. Tell me it ran, and I check the
                                  artifact and do the restore drill with you (below).

Secret and variable names:     DATABASE_URL (secret, `backup` environment); BACKUP_AGE_RECIPIENT (variable,
                               public key only); the private key is held by the maintainer only.

Where it is used in code:      .github/workflows/db-backup.yml, scripts/db/backup.sh,
                               scripts/db/restore-drill.sh. No application code reads any of it.

How I prove it without the real service:
                               Done in P6 against the local Supabase stack with a throwaway key and a
                               disposable dataset (60,000 orders, 180,000 messages, 2,000 users): backup.sh
                               produced a 23 MB age file with no plaintext in it (no PGDMP header);
                               restore-drill.sh decrypted it, restored it into a scratch Postgres and
                               compared all 66 tables in public, auth and storage (537,804 rows) by exact
                               row count and a checksum of the row contents, plus the 113 policy definitions and
                               25 public functions by checksum: PASSED. It fails if values change with the row
                               counts intact, if a policy rule changes, or with a wrong private key; the drill
                               fails (exit 1) and the scratch container is removed.

How I prove it live:           After step 4: download the artifact, run
                                 AGE_IDENTITY=<private key file> DATABASE_URL=<session pooler URL> \
                                   scripts/db/restore-drill.sh zarailink-<date>.dump.age
                               (it reads the hosted database only to count and checksum rows and restores into a scratch
                               container on your machine) and attach the PASSED line to the phase record. Do
                               this once now and again after any change to the schema.

If the service is down:        The scheduled run fails and GitHub emails you; nothing else is affected. Runs
                               are independent, so the next night's succeeds on its own.

Restoring for real:            NOT tested against a hosted project. What is known: the drill above restores the
                               whole dump into a scratch Postgres as `supabase_admin` (a superuser) and matches it
                               to the source. A hosted project does not give you that role, and Supabase owns the
                               `auth` and `storage` schemas there, so a straight `pg_restore` of them fails on
                               ownership. The plan for a real recovery, to be rehearsed on a scratch Supabase
                               project (gate G3) before it is ever needed:
                                 1. age -d -i private.key backup.dump.age > backup.dump    (on your machine only)
                                 2. new project, then the public schema:
                                      pg_restore --no-owner --no-privileges --schema=public \
                                        --clean --if-exists -d "$NEW_DATABASE_URL" backup.dump
                                 3. users and storage index (data only, into the tables the new project already
                                    has): pg_restore --data-only --schema=auth --schema=storage \
                                        -d "$NEW_DATABASE_URL" backup.dump
                                    This may need a role that can disable triggers; if the hosted `postgres` role
                                    cannot, restore the auth tables through the Supabase dashboard's SQL editor or
                                    support. Confirm on the scratch project which it is.
                               The storage FILES (images, documents) are NOT in this backup: they live in object
                               storage, so losing that bucket loses the files. Downloading them is a separate job
                               (not built).

Privacy and cost:              The dump holds users' emails, phone numbers and password hashes, which is why it
                               is encrypted before it leaves the runner. $0. GitHub retains the artifact 90
                               days; anyone with repository read access can download the ciphertext but not
                               read it.
```

## After this is done

- Flip the feature register's "Database backups" row from `Blocked` to `Works` once the live drill passes.
- Rotate the key pair if the private key is ever exposed: generate a new pair, update the variable, and keep the
  old private key long enough to open the backups still within 90 days.
