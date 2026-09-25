-- P6 (item 2): index every foreign key the Supabase advisor reported as unindexed, and tidy two redundancies.
--
-- An unindexed foreign key makes each delete or update of the referenced row scan the referencing table, and
-- makes joins and policy sub-queries on that column sequential. All sixteen below are foreign keys; none is
-- speculative. `conversations.participant_one/two` matter most: the conversation and message policies test
-- `participant_x = (select auth.uid())`, and the existing unique index is on an expression
-- (`least/greatest`) that cannot serve that predicate.
create index if not exists consultation_messages_recommended_listing_id_idx on public.consultation_messages (recommended_listing_id);
create index if not exists consultation_messages_sender_id_idx on public.consultation_messages (sender_id);
create index if not exists consultations_crop_id_idx on public.consultations (crop_id);
create index if not exists consultations_farm_id_idx on public.consultations (farm_id);
create index if not exists conversations_participant_one_idx on public.conversations (participant_one);
create index if not exists conversations_participant_two_idx on public.conversations (participant_two);
create index if not exists disease_cases_crop_id_idx on public.disease_cases (crop_id);
create index if not exists expert_verifications_reviewed_by_idx on public.expert_verifications (reviewed_by);
create index if not exists farm_crops_crop_id_idx on public.farm_crops (crop_id);
create index if not exists inventory_transactions_actor_idx on public.inventory_transactions (actor);
create index if not exists listing_views_viewer_id_idx on public.listing_views (viewer_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists order_items_listing_id_idx on public.order_items (listing_id);
create index if not exists order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index if not exists reports_resolved_by_idx on public.reports (resolved_by);
create index if not exists reviews_buyer_id_idx on public.reviews (buyer_id);

-- Chat history is read one conversation at a time, newest last: this serves the filter and the ordering, and
-- makes the single-column conversation index redundant.
create index if not exists messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
drop index if exists public.messages_conversation_id_idx;

-- Redundant: each is the leading column of a composite index that already exists.
drop index if exists public.notifications_user_id_idx;
drop index if exists public.listing_views_listing_id_idx;
