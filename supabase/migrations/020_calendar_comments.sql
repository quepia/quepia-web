-- Create table for calendar event comments
create table if not exists sistema_calendar_comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references sistema_calendar_events(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  author_name text not null, -- Can be client name or user name
  is_client boolean default false, -- True if posted by client via public link
  user_id uuid references auth.users(id) -- Optional, if posted by logged-in user
);

-- RLS Policies
alter table sistema_calendar_comments enable row level security;

-- Users can view comments for projects they have access to
create policy "Users can view comments on their projects"
  on sistema_calendar_comments for select
  using (
    exists (
      select 1 from sistema_calendar_events e
      join sistema_project_members m on m.project_id = e.project_id
      where e.id = sistema_calendar_comments.event_id
      and m.user_id = auth.uid()
    )
    or
    exists (
       select 1 from sistema_calendar_events e
       join sistema_projects p on p.id = e.project_id
       where e.id = sistema_calendar_comments.event_id
       and p.owner_id = auth.uid()
    )
  );

-- Users can insert comments on their projects
create policy "Users can insert comments on their projects"
  on sistema_calendar_comments for insert
  with check (
    exists (
      select 1 from sistema_calendar_events e
      join sistema_project_members m on m.project_id = e.project_id
      where e.id = sistema_calendar_comments.event_id
      and m.user_id = auth.uid()
    )
    or
    exists (
       select 1 from sistema_calendar_events e
       join sistema_projects p on p.id = e.project_id
       where e.id = sistema_calendar_comments.event_id
       and p.owner_id = auth.uid()
    )
  );

-- Function to allow public access (via token) to fetch comments
-- This is handled via the existing `get_client_project_data` RPC or a new RPC.
-- To simplify, we'll update the `get_client_project_data` function in a separate migration step or just rely on a new dedicated RPC for comments if needed.
-- But the robust way for the `ClientViewPage` to fetch comments is to include them in the `get_client_project_data` response.

-- We also need an RPC to insert comments from the public view (unauthenticated but with valid token)
create or replace function public_add_calendar_comment(
  token text,
  event_id uuid,
  content text,
  author_name text
)
returns json
language plpgsql
security definer
as $$
declare
  access_record record;
  event_record record;
begin
  -- 1. Verify token
  select * into access_record
  from sistema_client_access
  where id::text = token; -- Assuming token is the ID. If not, adjust accordingly.

  if access_record is null then
    return json_build_object('error', 'Invalid token');
  end if;

  if not access_record.can_comment then
    return json_build_object('error', 'Commenting not allowed');
  end if;

  -- 2. Verify event belongs to the project associated with the token
  select * into event_record
  from sistema_calendar_events
  where id = event_id
  and project_id = access_record.project_id;

  if event_record is null then
     return json_build_object('error', 'Event not found or access denied');
  end if;

  -- 3. Insert comment
  insert into sistema_calendar_comments (event_id, content, created_at, author_name, is_client)
  values (event_id, content, now(), author_name, true);

  return json_build_object('success', true);
end;
$$;
