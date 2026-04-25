-- Canonicalize task dates around deadline and track daily overdue digests.

-- Backfill deadline from the legacy due_date column.
update public.sistema_tasks
set deadline = (due_date + time '12:00')
where deadline is null
  and due_date is not null;

-- Keep due_date as a compatibility mirror while the product uses deadline.
update public.sistema_tasks
set due_date = deadline::date
where deadline is not null
  and due_date is distinct from deadline::date;

create or replace function public.sync_sistema_task_deadline_fields()
returns trigger as $$
begin
  if new.deadline is null and new.due_date is not null then
    new.deadline := (new.due_date + time '12:00');
  end if;

  if new.deadline is not null then
    new.due_date := new.deadline::date;
  else
    new.due_date := null;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_sistema_task_deadline_fields on public.sistema_tasks;
create trigger trg_sync_sistema_task_deadline_fields
before insert or update of due_date, deadline
on public.sistema_tasks
for each row
execute function public.sync_sistema_task_deadline_fields();

create index if not exists idx_sistema_tasks_assignee_completed_deadline
  on public.sistema_tasks (assignee_id, completed, deadline)
  where assignee_id is not null;

create table if not exists public.sistema_task_deadline_notification_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sistema_users(id) on delete cascade,
  notification_type text not null default 'overdue_daily'
    check (notification_type in ('overdue_daily')),
  notification_date date not null,
  overdue_task_ids uuid[] not null default '{}',
  due_today_task_ids uuid[] not null default '{}',
  email_id text,
  created_at timestamptz not null default now(),
  unique (user_id, notification_type, notification_date)
);

alter table public.sistema_task_deadline_notification_runs enable row level security;

create policy "Users can view own task deadline notification runs"
on public.sistema_task_deadline_notification_runs
for select
using (auth.uid() = user_id);

create index if not exists idx_task_deadline_notification_runs_date
  on public.sistema_task_deadline_notification_runs (notification_type, notification_date);
