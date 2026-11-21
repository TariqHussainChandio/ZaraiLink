-- D20 (2026-11-22): expert advisory is the farmer's alone. Buyers and dealers have no way to ask an expert in the app,
-- and the API refuses them (POST /api/v1/consultations needs the farmer role); this makes the database refuse the same
-- insert, so a call that goes straight to the Data API with a buyer's or dealer's session cannot open one either.
-- Every other condition of the policy is kept exactly as 20261005080000_account_status.sql left it. Consultations that
-- already exist are untouched: this changes who may start one, not who may read or answer one.
alter policy "consultations_insert_requester" on public.consultations
  with check (
    (user_id = (select auth.uid())) and (not (select public.is_suspended())) and (select public.is_account_approved())
    and ((select public.caller_role()) = 'farmer'::public.user_role)
    and (status = 'requested') and (expert_id is not null) and (expert_id <> user_id)
    and exists (
      select 1 from public.experts e where e.id = consultations.expert_id and e.verification_status = 'approved')
    and (select public.is_approved_expert_id(consultations.expert_id))
  );
