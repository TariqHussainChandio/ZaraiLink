-- P6 (item 4), follow-up from the independent verification: also remove MAINTAIN.
--
-- Postgres 17 added a MAINTAIN table privilege (VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK TABLE). The migration
-- role's default privileges hand it to anon, authenticated and service_role on every table, like the TRUNCATE,
-- REFERENCES and TRIGGER grants removed in 20260926080400. No client role needs it, and it is not reachable through
-- the Data API, so this is least-privilege tidying rather than a hole. The privilege does not exist before
-- Postgres 17 (a hosted project may still run an older major version), hence the version guard.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated, service_role';
    execute 'alter default privileges in schema public revoke maintain on tables from anon, authenticated, service_role';
  end if;
end
$$;
