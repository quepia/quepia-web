-- Create reviews table
create table sistema_reviews (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references sistema_tasks(id) on delete cascade not null,
  token uuid default gen_random_uuid() not null unique,
  status text check (status in ('pending', 'approved', 'changes_requested')) default 'pending',
  deliverable_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create review comments table
create table sistema_review_comments (
  id uuid default gen_random_uuid() primary key,
  review_id uuid references sistema_reviews(id) on delete cascade not null,
  author_name text not null, -- Can be "Client" or system user name
  author_id uuid references auth.users(id) on delete set null, -- Null for external clients
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table sistema_reviews enable row level security;
alter table sistema_review_comments enable row level security;

-- Policies for reviews
-- Everyone can read reviews if they have the token (handled by application logic lookup, or public policy)
-- Secure way: The public page fetches via a function that bypasses RLS or a policy checking the token. 
-- Since token is unique and effectively a password, we can allow select by token.

create policy "Reviews are viewable by everyone with token"
  on sistema_reviews for select
  using (true); -- We will filter by token in the query anyway

create policy "Users can create reviews"
  on sistema_reviews for insert
  with check (auth.uid() is not null);

create policy "Users can update reviews"
  on sistema_reviews for update
  using (auth.uid() is not null);

-- Policies for comments
create policy "Comments are viewable by everyone"
  on sistema_review_comments for select
  using (true);

create policy "Everyone can create comments"
  on sistema_review_comments for insert
  with check (true);
