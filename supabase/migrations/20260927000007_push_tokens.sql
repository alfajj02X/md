-- Push tokens for Expo push notifications. One row per (user, token);
-- the app upserts on launch and deletes on sign-out.

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android'
    check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);
create index push_tokens_user_idx on push_tokens (user_id);

alter table push_tokens enable row level security;

-- Users manage only their own tokens. The notify path reads via service role.
create policy push_tokens_owner on push_tokens
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

create trigger set_push_tokens_updated_at before update on push_tokens
  for each row execute function set_updated_at();
