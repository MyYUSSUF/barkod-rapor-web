begin;

do $$
declare
  target_table regclass := to_regclass('public.native_push_subscriptions');
  platform_attnum smallint;
  unexpected_constraints text;
begin
  if target_table is null then
    raise exception 'public.native_push_subscriptions table does not exist';
  end if;

  select attnum
  into platform_attnum
  from pg_attribute
  where attrelid = target_table
    and attname = 'platform'
    and not attisdropped;

  if platform_attnum is null then
    raise exception 'public.native_push_subscriptions.platform column does not exist';
  end if;

  select string_agg(c.conname, ', ' order by c.conname)
  into unexpected_constraints
  from pg_constraint c
  where c.conrelid = target_table
    and c.contype = 'c'
    and platform_attnum = any(c.conkey)
    and c.conname <> 'native_push_subscriptions_platform_check';

  if unexpected_constraints is not null then
    raise exception
      'Unexpected platform check constraint(s): %',
      unexpected_constraints;
  end if;
end;
$$;

alter table public.native_push_subscriptions
  drop constraint if exists native_push_subscriptions_platform_check;

alter table public.native_push_subscriptions
  add constraint native_push_subscriptions_platform_check
  check (platform in ('android', 'ios', 'ios-sandbox'))
  not valid;

alter table public.native_push_subscriptions
  validate constraint native_push_subscriptions_platform_check;

comment on constraint native_push_subscriptions_platform_check
  on public.native_push_subscriptions is
  'Allows Android FCM, production APNs, and sandbox APNs registrations.';

commit;
