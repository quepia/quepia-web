-- Reels are produced differently from long-form video (vertical, cover frame,
-- published straight to social), so they get their own task type.
alter table public.sistema_tasks
  drop constraint if exists sistema_tasks_task_type_check;

alter table public.sistema_tasks
  add constraint sistema_tasks_task_type_check
  check (task_type = any (array['diseno', 'copy', 'video', 'reel', 'strategy', 'revision', 'otro']));
