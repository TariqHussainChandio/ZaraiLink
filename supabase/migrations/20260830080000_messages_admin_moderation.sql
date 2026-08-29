-- Module 18 (Admin — content moderation, SRDS v4.0 §21.6): admins reviewing a report against a
-- chat message need to (a) actually read the message to judge it, and (b) redact its body if
-- the report is upheld. Neither exists today.
--
-- (a) `messages_select_participants` has no admin bypass, unlike every other table's select
--     policy — also a gap against docs/architecture/authorization-model.md's own stated rule
--     that messages should already be admin-readable. Fixed by replacing the policy.
-- (b) `messages` has never had ANY update policy or grant. Found while designing this: the
--     already-shipped `markConversationRead()` (Module 12, `messagingService.ts`) calls
--     `.update({ read_at })` — under RLS with no update policy at all, that update silently
--     affects 0 rows every time it's called. Read receipts have likely never actually been set
--     in the live app. Fixed alongside the admin redaction policy since it's the same table/
--     migration: a participant may set `read_at` on their own conversation's messages, and an
--     admin may redact `body` — both restricted to exactly those columns by one guard trigger
--     (RLS can't do column-level checks, so a trigger does, same pattern as
--     `guard_profiles_role`/`guard_experts_verification_status`/`guard_payments_columns`).

drop policy "messages_select_participants" on public.messages;

create policy "messages_select_participants"
  on public.messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

create policy "messages_update_admin"
  on public.messages for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "messages_update_participant_read_receipt"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

create or replace function public.guard_messages_updates()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id is distinct from old.sender_id
    or new.conversation_id is distinct from old.conversation_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'sender_id, conversation_id, and created_at cannot be changed';
  end if;

  if new.body is distinct from old.body and not public.is_admin() then
    raise exception 'Only an admin may change a message body (moderation redaction)';
  end if;

  return new;
end;
$$;

create trigger guard_messages_updates
  before update on public.messages
  for each row execute function public.guard_messages_updates();

grant update (body, read_at) on public.messages to authenticated;
