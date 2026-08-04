begin;

alter table public.native_push_subscriptions
  add column if not exists device_hash text;

create unique index if not exists native_push_subscriptions_device_hash_key
  on public.native_push_subscriptions (device_hash);

create index if not exists native_push_subscriptions_user_device_idx
  on public.native_push_subscriptions (user_id, device_hash);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'native_push_subscriptions_user_device_fkey'
      and conrelid = 'public.native_push_subscriptions'::regclass
  ) then
    alter table public.native_push_subscriptions
      add constraint native_push_subscriptions_user_device_fkey
      foreign key (user_id, device_hash)
      references public.user_devices (user_id, device_hash)
      on delete cascade
      not valid;
  end if;
end;
$$;

alter table public.native_push_subscriptions
  validate constraint native_push_subscriptions_user_device_fkey;

comment on column public.native_push_subscriptions.device_hash is
  'SHA-256 hash of the server-received X-Device-Token. Null only for legacy registrations.';

commit;
