-- Module 12 (Messaging, §18 "may support" image attachments). Purely additive.
-- `messages` gets an `attachments text[]` column, matching the pattern already used by
-- `consultation_messages.attachments` (Module 4). Images live in a NEW, non-public storage
-- bucket — unlike `avatars`/`listing-images` (both intentionally public, since profile photos
-- and produce photos are meant to be publicly visible), a chat is private between two
-- participants, so a public bucket would leak private images to anyone who obtained the URL.
-- Objects are stored at `${conversation_id}/${sender_id}/...`; RLS extracts the conversation id
-- from the path via `storage.foldername` and checks the caller is a participant in that
-- conversation, mirroring how `messages`/`conversations` are already scoped.

alter table public.messages add column attachments text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

create policy "message_attachments_select_participants"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

create policy "message_attachments_participant_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and owner = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );
