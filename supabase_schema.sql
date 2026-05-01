
-- 1. Create Profiles Table (for user metadata)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  full_name text,
  avatar_url text,
  website text,
  updated_at timestamp with time zone,
  plan text default 'Free',
  constraint username_length check (char_length(username) >= 3)
);

-- 2. Create Items Table (files and folders)
create table public.items (
  id text not null primary key, -- using text ID to match frontend generation for now, could be UUID
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  type text not null check (type in ('file', 'folder')),
  file_type text check (file_type in ('image', 'video', 'raw', 'doc')),
  size bigint default 0,
  parent_id text, -- references items(id) self-referential, nullable for root
  s3_key text,
  preview_url text, -- for external URLs if needed
  tags text[], -- array of strings
  description text,
  rating integer default 0,
  flag text check (flag in ('picked', 'rejected', null)),
  width integer,
  height integer,
  make text,
  model text,
  date_taken timestamp with time zone,
  date_added timestamp with time zone default now(),
  sync_status text default 'synced',
  video_metadata jsonb, -- store complex video data
  proxy_s3_key text,
  group_id text,
  is_stack_top boolean default false,
  is_analyzing boolean default false
);

-- 3. Enable RLS
alter table public.profiles enable row level security;
alter table public.items enable row level security;

-- 4. Policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

create policy "Items are viewable by owner."
  on items for select
  using ( auth.uid() = user_id );

create policy "Items are insertable by owner."
  on items for insert
  with check ( auth.uid() = user_id );

create policy "Items are updateable by owner."
  on items for update
  using ( auth.uid() = user_id );

create policy "Items are deletable by owner."
  on items for delete
  using ( auth.uid() = user_id );

-- 5. Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, username)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', new.email);
  return new;
end;
$$ language plpgsql security definer;

-- 6. Trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
