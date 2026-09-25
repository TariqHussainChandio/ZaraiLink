-- P6 (item 1/2): harden the helper and trigger functions.
--
-- 1. `search_path` on the SECURITY DEFINER helpers gains `pg_temp`, listed last, so a temporary object created
--    by a caller can never shadow anything the function resolves (the other definer functions already had it).
--    The helpers stay executable by anon and authenticated: row-level-security policies call them as the
--    querying role, including anon on public tables.
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_suspended() set search_path = public, pg_temp;
alter function public.is_admin_aal2() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;

-- 2. Trigger and event-trigger functions are never called by a client. A trigger runs its function without a
--    per-call EXECUTE check, so revoking it changes nothing for the triggers and closes the RPC surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.notify_new_order() from public, anon, authenticated;
revoke execute on function public.notify_order_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_payment_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.notify_consultation_created() from public, anon, authenticated;
revoke execute on function public.notify_consultation_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_listing_status_changed() from public, anon, authenticated;
revoke execute on function public.notify_inventory_low_stock() from public, anon, authenticated;
revoke execute on function public.notify_expert_verification_changed() from public, anon, authenticated;
revoke execute on function public.notify_account_suspension_changed() from public, anon, authenticated;

-- 3. Stock functions are called by signed-in users only (through the backend's user-scoped client); anon has no
--    table access, so it could never use them, and should not see them as callable.
revoke execute on function public.available_stock(uuid[]) from public, anon;
revoke execute on function public.adjust_stock(uuid, text, numeric, uuid, text) from public, anon;
revoke execute on function public.reduce_stock_for_order(uuid, uuid) from public, anon;
grant execute on function public.available_stock(uuid[]) to authenticated;
grant execute on function public.adjust_stock(uuid, text, numeric, uuid, text) to authenticated;
grant execute on function public.reduce_stock_for_order(uuid, uuid) to authenticated;
