-- P6 (item 4): least-privilege table grants, found by the pgTAP suite.
--
-- The role that runs migrations has default privileges that hand `anon`, `authenticated` and `service_role`
-- TRUNCATE, REFERENCES and TRIGGER on every table it creates, on top of the specific grants each migration
-- writes. None of the three is ever needed by an API caller. TRUNCATE is the dangerous one: it ignores
-- row-level security, so the only thing standing between a client role and an emptied table would be that no
-- client can reach it. This removes all three from the tables that exist and from tables created later.
-- The select/insert/update/delete grants each migration gives are untouched.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated, service_role;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated, service_role;
