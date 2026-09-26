-- Finding N3 (standardization plan, P0 baseline / P5a "Backend repair"). The migrations never
-- granted `service_role` anything beyond the implicit REFERENCES/TRIGGER/TRUNCATE every role
-- gets — confirmed against the real local database (information_schema.role_table_grants):
-- zero SELECT/INSERT/UPDATE/DELETE anywhere. `disease_repository.py` is the only file using the
-- service-role client (backend-architecture.md's documented exception #3) and every call it
-- makes 42501s ("permission denied") on a database built only from migrations, even though it
-- may have appeared to work on the hosted project if that project still carries older,
-- looser default privileges.
--
-- Grants are scoped to exactly what disease_repository.py does, not a blanket grant:
--   - disease_cases: read (get_disease_case, get_case_with_prediction) + write (create_case)
--   - disease_predictions: read (embedded in get_case_with_prediction) + write (insert_prediction)
--   - crops: read only (embedded in get_case_with_prediction as `crop:crops(id,name)`)
grant select, insert on public.disease_cases to service_role;
grant select, insert on public.disease_predictions to service_role;
grant select on public.crops to service_role;
