-- Migration: Notification System
-- Tables: sistema_notification_preferences, sistema_notifications

-- 1. Notification Preferences Table
create table if not exists sistema_notification_preferences (
  user_id uuid references auth.users(id) on delete cascade primary key,
  email_enabled boolean default true,
  in_app_enabled boolean default true,
  frequency text check (frequency in ('immediate', 'daily_digest', 'weekly')) default 'immediate',
  digest_time time default '09:00:00',
  notify_mentions boolean default true,
  notify_assignments boolean default true,
  notify_approvals boolean default true, -- For PMs/Clients
  notify_status_changes boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for Preferences
alter table sistema_notification_preferences enable row level security;

create policy "Users can view their own preferences"
  on sistema_notification_preferences for select
  using (auth.uid() = user_id);

create policy "Users can update their own preferences"
  on sistema_notification_preferences for update
  using (auth.uid() = user_id);

create policy "Users can insert their own preferences"
  on sistema_notification_preferences for insert
  with check (auth.uid() = user_id);

-- 2. In-App Notifications Table
create table if not exists sistema_notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  actor_id uuid references auth.users(id) on delete set null, -- Who triggered the notification
  type text check (type in ('mention', 'assignment', 'approval_request', 'status_change', 'comment', 'system')) not null,
  title text not null,
  content text,
  link text, -- URL to redirect
  data jsonb default '{}'::jsonb, -- Extra context (task_id, project_id, etc.)
  read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- RLS for Notifications
alter table sistema_notifications enable row level security;

create policy "Users can view their own notifications"
  on sistema_notifications for select
  using (auth.uid() = user_id);

create policy "Users can update (mark read) their own notifications"
  on sistema_notifications for update
  using (auth.uid() = user_id);

-- Only system/triggers usually insert, but allows users to create invites etc if needed? 
-- Better to keep insert restrictive or allow authenticated users to notify others (e.g. mentions)
create policy "Users can insert notifications for others"
  on sistema_notifications for insert
  with check (auth.uid() = actor_id); 

-- Indexes
create index if not exists idx_notifications_user_unread on sistema_notifications(user_id) where read = false;
create index if not exists idx_notifications_created_at on sistema_notifications(created_at desc);

-- Function to handle new user preferences automatically
create or replace function public.handle_new_user_preferences()
returns trigger as $$
begin
  insert into public.sistema_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create preferences when a new user signs up (if using public.users table or similar wrapper)
-- Assuming we use auth.users or sistema_users. Let's hook into sistema_users creation if it exists or create on demand.
-- For now, we will handle creation in the application layer or use a trigger on sistema_users if it maps 1:1

-- Add trigger for updated_at on preferences
create trigger handle_updated_at before update on sistema_notification_preferences
  for each row execute procedure update_updated_at_column();
