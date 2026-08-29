-- Module 14 follow-up: both `consultations.images` (initial problem photos) and
-- `consultation_messages.attachments` (chat images) need somewhere to actually live — neither
-- had a storage bucket. Private (like `message-attachments`), scoped to the consultation's two
-- participants via the object path (`${consultation_id}/${uploader_id}/...`), same
-- `storage.foldername` pattern as `message-attachments` (Module 12).

insert into storage.buckets (id, name, public)
values ('consultation-attachments', 'consultation-attachments', false)
on conflict (id) do nothing;

create policy "consultation_attachments_select_participants"
  on storage.objects for select
  using (
    bucket_id = 'consultation-attachments'
    and exists (
      select 1 from public.consultations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_id = auth.uid() or c.expert_id = auth.uid() or public.is_admin())
    )
  );

create policy "consultation_attachments_participant_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'consultation-attachments'
    and owner = auth.uid()
    and exists (
      select 1 from public.consultations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_id = auth.uid() or c.expert_id = auth.uid())
    )
  );
