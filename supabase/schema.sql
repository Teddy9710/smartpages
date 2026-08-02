-- SmartPages Cloud: run this once in Supabase SQL Editor.
-- The bucket stays private; users can only access their own folder.

create extension if not exists pgcrypto;

create table if not exists public.cloud_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'SmartPages document',
  format text not null default 'markdown' check (format in ('markdown', 'html', 'text')),
  content text not null default '',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cloud_documents_user_updated_idx
  on public.cloud_documents (user_id, updated_at desc);

alter table public.cloud_documents enable row level security;

drop policy if exists "Users can read their cloud documents" on public.cloud_documents;
create policy "Users can read their cloud documents"
  on public.cloud_documents for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their cloud documents" on public.cloud_documents;
create policy "Users can create their cloud documents"
  on public.cloud_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their cloud documents" on public.cloud_documents;
create policy "Users can update their cloud documents"
  on public.cloud_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their cloud documents" on public.cloud_documents;
create policy "Users can delete their cloud documents"
  on public.cloud_documents for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smartpages-assets',
  'smartpages-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their SmartPages assets" on storage.objects;
create policy "Users can read their SmartPages assets"
  on storage.objects for select
  using (
    bucket_id = 'smartpages-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their SmartPages assets" on storage.objects;
create policy "Users can upload their SmartPages assets"
  on storage.objects for insert
  with check (
    bucket_id = 'smartpages-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their SmartPages assets" on storage.objects;
create policy "Users can update their SmartPages assets"
  on storage.objects for update
  using (
    bucket_id = 'smartpages-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their SmartPages assets" on storage.objects;
create policy "Users can delete their SmartPages assets"
  on storage.objects for delete
  using (
    bucket_id = 'smartpages-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
