-- SRDS v4.0 Module 4 (Reports & Moderation §21.6, Notifications §19, Audit Logs §21.9/BR-15).
-- Purely additive.

create type public.report_target_type as enum ('product', 'user', 'review', 'message', 'expert', 'listing');
create type public.report_status as enum ('open', 'investigating', 'resolved', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null,
  status public.report_status not null default 'open',
  resolution_notes text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

create policy "reports_select_own_or_admin"
  on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());

create policy "reports_insert_reporter"
  on public.reports for insert
  with check (reporter_id = auth.uid());

create policy "reports_admin_update"
  on public.reports for update
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on public.reports to authenticated;
grant update on public.reports to authenticated;

-- ── notifications (§19) ──────────────────────────────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_user_id_read_idx on public.notifications (user_id, read);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Written by triggers/backend (service-role) reacting to the events in §19, never inserted
-- directly by the mobile client — a user marking their own notification read/unread is the
-- only client-side write.
grant select, update on public.notifications to authenticated;

-- ── audit_logs (§21.9, BR-15) ────────────────────────────────────────────────

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_entity text not null,
  target_id uuid,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_target_idx on public.audit_logs (target_entity, target_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_admin"
  on public.audit_logs for select
  using (public.is_admin());

create policy "audit_logs_insert_admin"
  on public.audit_logs for insert
  with check (public.is_admin());

grant select, insert on public.audit_logs to authenticated;
