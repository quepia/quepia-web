-- Scheduled Telegram reminders for client-ready asset deliveries.

create table if not exists public.sistema_client_notification_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sistema_projects(id) on delete cascade,
  task_id uuid not null references public.sistema_tasks(id) on delete cascade,
  created_by uuid not null references public.sistema_users(id) on delete restrict,
  cancelled_by uuid references public.sistema_users(id) on delete set null,
  asset_ids uuid[] not null default '{}'::uuid[],
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  telegram_sent integer not null default 0,
  telegram_link_fallbacks integer not null default 0,
  telegram_failed integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  processing_started_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sistema_client_notification_schedules enable row level security;

drop policy if exists sistema_client_notification_schedules_select
on public.sistema_client_notification_schedules;
create policy sistema_client_notification_schedules_select
on public.sistema_client_notification_schedules
for select
using (public.sistema_can_access_project(project_id, auth.uid()));

drop policy if exists sistema_client_notification_schedules_insert
on public.sistema_client_notification_schedules;
create policy sistema_client_notification_schedules_insert
on public.sistema_client_notification_schedules
for insert
with check (
  created_by = auth.uid()
  and public.sistema_can_write_project(project_id, auth.uid())
);

drop policy if exists sistema_client_notification_schedules_update
on public.sistema_client_notification_schedules;
create policy sistema_client_notification_schedules_update
on public.sistema_client_notification_schedules
for update
using (public.sistema_can_write_project(project_id, auth.uid()))
with check (public.sistema_can_write_project(project_id, auth.uid()));

drop policy if exists sistema_client_notification_schedules_delete
on public.sistema_client_notification_schedules;
create policy sistema_client_notification_schedules_delete
on public.sistema_client_notification_schedules
for delete
using (public.sistema_can_write_project(project_id, auth.uid()));

create index if not exists idx_client_notification_schedules_pending
  on public.sistema_client_notification_schedules (status, scheduled_at)
  where status = 'pending';

create index if not exists idx_client_notification_schedules_task
  on public.sistema_client_notification_schedules (task_id, scheduled_at desc);

create index if not exists idx_client_notification_schedules_project
  on public.sistema_client_notification_schedules (project_id, scheduled_at desc);

create index if not exists idx_client_notification_schedules_asset_ids
  on public.sistema_client_notification_schedules using gin (asset_ids);

notify pgrst, 'reload schema';
