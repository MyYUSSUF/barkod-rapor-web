create table if not exists public.native_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android')),
  token text not null unique,
  device_name text,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_push_subscriptions_user_updated_at_idx
  on public.native_push_subscriptions (user_id, updated_at desc);

alter table public.native_push_subscriptions enable row level security;

revoke all on public.native_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.native_push_subscriptions to service_role;

comment on table public.native_push_subscriptions is
  'Native mobile push notification registrations managed by server-side APIs.';
