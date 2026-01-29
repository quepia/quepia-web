-- 028_storage_bucket.sql

-- 1. Create a new storage bucket 'project-images'
insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do nothing;

-- 2. Enable RLS
-- (Note: storage.objects usually has RLS enabled by default, but we ensure policies exist)

-- 3. Create policies for 'project-images'

-- Allow public access to view images
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'project-images' );

-- Allow authenticated users to upload images
create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id = 'project-images' and auth.role() = 'authenticated' );

-- Allow users to update their own uploads (optional, simplistic check)
create policy "Owner Update"
  on storage.objects for update
  using ( bucket_id = 'project-images' and auth.uid() = owner );

-- Allow users to delete their own uploads
create policy "Owner Delete"
  on storage.objects for delete
  using ( bucket_id = 'project-images' and auth.uid() = owner );
