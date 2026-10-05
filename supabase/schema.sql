-- vanotes cloud tables. Run this in the Supabase SQL editor
-- (Project → SQL → New query → paste → Run).
-- It is safe to run again: everything is created only if missing. If you ran an earlier version of this file,
-- run this one too: it adds the Realtime section at the bottom (so other windows update instantly).
--
-- Supabase is the source of truth for every signed-in account: all notes, projects, images and calendar events are
-- stored here, tied to the account's user id and protected by row-level security. Browsers only hold a temporary view.

-- ---------- tables ----------

create table if not exists public.projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  color text not null,
  icon text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  project_id text not null,
  title text not null default '',
  content jsonb not null,
  body_text text not null default '',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  start_at bigint not null,
  end_at bigint not null,
  all_day boolean not null default false,
  location text,
  description text,
  link text,
  source_name text not null,
  note_id text,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.note_images (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  note_id text not null,
  name text not null,
  sort_order int not null default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists projects_user_updated on public.projects (user_id, updated_at);
create index if not exists notes_user_updated on public.notes (user_id, updated_at);
create index if not exists notes_user_project on public.notes (user_id, project_id);
create index if not exists events_user_updated on public.events (user_id, updated_at);
create index if not exists note_images_user_note on public.note_images (user_id, note_id);

alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.events enable row level security;
alter table public.note_images enable row level security;

-- each signed-in user can only see and change their own rows
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'projects' and policyname = 'own projects') then
    create policy "own projects" on public.projects for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'notes' and policyname = 'own notes') then
    create policy "own notes" on public.notes for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'own events') then
    create policy "own events" on public.events for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_images' and policyname = 'own note_images') then
    create policy "own note_images" on public.note_images for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------- image files ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'own note images read') then
    create policy "own note images read" on storage.objects for select to authenticated
      using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'own note images insert') then
    create policy "own note images insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'own note images update') then
    create policy "own note images update" on storage.objects for update to authenticated
      using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'own note images delete') then
    create policy "own note images delete" on storage.objects for delete to authenticated
      using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------- realtime ----------
-- Lets every open window of an account hear about changes immediately (changes arrive only to the account that owns
-- the row — row-level security applies). Without this, windows still catch up, just every ~15 seconds instead of instantly.

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'notes', 'events', 'note_images']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null; -- already enabled
      when undefined_object then null; -- publication missing (not a Supabase project): skip
    end;
  end loop;
end $$;

-- Optional housekeeping: deleted items are kept as "tombstones" (deleted_at is set) so that every window learns about
-- a delete. If you ever want to tidy old ones, run something like:
--   delete from public.notes where deleted_at is not null and deleted_at < (extract(epoch from now() - interval '90 days') * 1000);
