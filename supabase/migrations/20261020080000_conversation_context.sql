-- A5: a conversation exists only on a legitimate relationship (SRDS §30, D12). It is started from a listing (anyone and
-- the listing's owner), an order (its buyer and its seller) or a consultation (its requester and its assigned expert),
-- and the row records which one. Before this, any two approved users could open a conversation.
--
-- Rows created before A5 keep a null context; every new row must carry one (the insert policy below). One conversation
-- per pair stays (conversations_participants_idx): a second inquiry between the same two people reopens the first
-- thread, and its context records how the pair first met.

create type public.conversation_context as enum ('listing', 'order', 'consultation');

alter table public.conversations
  add column context_type public.conversation_context,
  add column context_id uuid,
  add constraint conversations_context_pair check ((context_type is null) = (context_id is null));

-- Whether the caller and other_id are related through the given listing, order or consultation. Definer, because the
-- caller cannot always read the row that proves it (a listing turned sold, an order row seen only by its two parties);
-- it answers yes or no and returns nothing else.
create or replace function public.conversation_context_allowed(
  ctx_type public.conversation_context, ctx_id uuid, other_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case ctx_type
    when 'listing' then exists (
      select 1 from public.listings l
       where l.id = ctx_id
         and l.owner_id = other_id
         -- A hidden (inactive) listing is no context: otherwise anyone holding its id could confirm who owns it. A sold
         -- one still is, so a buyer can ask about it.
         and l.status in ('active', 'sold'))
    when 'order' then exists (
      select 1 from public.orders o
       where o.id = ctx_id
         and ((o.buyer_id = (select auth.uid()) and o.seller_id = other_id)
           or (o.seller_id = (select auth.uid()) and o.buyer_id = other_id)))
    when 'consultation' then exists (
      select 1 from public.consultations c
       where c.id = ctx_id
         and ((c.user_id = (select auth.uid()) and c.expert_id = other_id)
           or (c.expert_id = (select auth.uid()) and c.user_id = other_id)))
    else false
  end
$$;

revoke execute on function public.conversation_context_allowed(public.conversation_context, uuid, uuid)
  from public, anon;
grant execute on function public.conversation_context_allowed(public.conversation_context, uuid, uuid)
  to authenticated;

-- The caller is one participant and the other must be related to them through the context. A listing inquiry is opened
-- by the person asking, towards the owner; the owner answers in that thread and cannot cold-message people from a listing.
drop policy "conversations_insert_participant" on public.conversations;
create policy "conversations_insert_related" on public.conversations for insert
  with check (
    (select public.is_account_approved())
    and not (select public.is_suspended())
    and context_type is not null
    and (
      (participant_one = (select auth.uid())
        and public.conversation_context_allowed(context_type, context_id, participant_two))
      or (participant_two = (select auth.uid())
        and public.conversation_context_allowed(context_type, context_id, participant_one))
    )
  );
