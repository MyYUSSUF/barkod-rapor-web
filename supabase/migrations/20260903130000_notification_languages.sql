begin;

alter table public.push_subscriptions
  add column if not exists notification_language text;

alter table public.native_push_subscriptions
  add column if not exists notification_language text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_subscriptions_notification_language_check'
      and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_notification_language_check
      check (
        notification_language is null
        or notification_language in ('tr', 'en')
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'native_push_subscriptions_notification_language_check'
      and conrelid = 'public.native_push_subscriptions'::regclass
  ) then
    alter table public.native_push_subscriptions
      add constraint native_push_subscriptions_notification_language_check
      check (
        notification_language is null
        or notification_language in ('tr', 'en')
      )
      not valid;
  end if;
end;
$$;

alter table public.push_subscriptions
  validate constraint push_subscriptions_notification_language_check;

alter table public.native_push_subscriptions
  validate constraint native_push_subscriptions_notification_language_check;

comment on column public.push_subscriptions.notification_language is
  'Preferred scheduled notification language: tr or en. Null for registrations that have not reported a preference yet.';

comment on column public.native_push_subscriptions.notification_language is
  'Preferred scheduled notification language: tr or en. Null for registrations that have not reported a preference yet.';

create or replace function public.preserve_notification_language()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notification_language is null then
    new.notification_language := old.notification_language;
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_notification_language() from public;

drop trigger if exists push_subscriptions_preserve_notification_language
  on public.push_subscriptions;
create trigger push_subscriptions_preserve_notification_language
before update on public.push_subscriptions
for each row execute function public.preserve_notification_language();

drop trigger if exists native_push_subscriptions_preserve_notification_language
  on public.native_push_subscriptions;
create trigger native_push_subscriptions_preserve_notification_language
before update on public.native_push_subscriptions
for each row execute function public.preserve_notification_language();

create or replace function public.set_native_notification_language(
  p_device_hash text,
  p_notification_language text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_device_hash is null
    or trim(p_device_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device hash' using errcode = '22023';
  end if;

  if p_notification_language is null
    or lower(trim(p_notification_language)) not in ('tr', 'en') then
    raise exception 'Invalid notification language' using errcode = '22023';
  end if;

  update public.native_push_subscriptions
  set
    notification_language = lower(trim(p_notification_language)),
    updated_at = now()
  where user_id = (select auth.uid())
    and device_hash = trim(p_device_hash);

  return found;
end;
$$;

revoke all on function public.set_native_notification_language(text, text)
  from public, anon, authenticated;
grant execute on function public.set_native_notification_language(text, text)
  to authenticated, service_role;

commit;
