create table if not exists public.notification_automations (
  id uuid primary key default gen_random_uuid(),
  system_key text unique,
  name text not null,
  content_type text not null default 'custom',
  audience_type text not null default 'all',
  target_user_id uuid references public.profiles(id) on delete cascade,
  delivery_scope text not null default 'all_devices',
  timezone text not null default 'Africa/Cairo',
  send_time time without time zone not null,
  days_of_week smallint[] not null default array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  title_tr text,
  body_tr text,
  title_en text,
  body_en text,
  url text not null default '/',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_automations_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint notification_automations_content_type_check
    check (content_type in ('custom', 'daily_motivation')),
  constraint notification_automations_audience_check
    check (audience_type in ('all', 'user')),
  constraint notification_automations_target_check
    check (
      (audience_type = 'all' and target_user_id is null)
      or (audience_type = 'user' and target_user_id is not null)
    ),
  constraint notification_automations_delivery_scope_check
    check (delivery_scope in ('all_devices', 'latest_device')),
  constraint notification_automations_timezone_check
    check (timezone = 'Africa/Cairo'),
  constraint notification_automations_days_check
    check (
      cardinality(days_of_week) between 1 and 7
      and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  constraint notification_automations_custom_content_check
    check (
      content_type = 'daily_motivation'
      or (
        char_length(btrim(coalesce(title_tr, ''))) between 1 and 120
        and char_length(btrim(coalesce(body_tr, ''))) between 1 and 800
        and char_length(btrim(coalesce(title_en, ''))) between 1 and 120
        and char_length(btrim(coalesce(body_en, ''))) between 1 and 800
      )
    )
);

create table if not exists public.notification_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.notification_automations(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'started',
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  response jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint notification_automation_runs_status_check
    check (status in ('started', 'completed', 'failed')),
  constraint notification_automation_runs_unique_occurrence
    unique (automation_id, scheduled_for)
);

create table if not exists public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  automation_id uuid references public.notification_automations(id) on delete set null,
  automation_run_id uuid references public.notification_automation_runs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  localized_messages jsonb,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  constraint notification_delivery_logs_source_check
    check (source in ('manual', 'automation', 'daily_motivation')),
  constraint notification_delivery_logs_counts_check
    check (total >= 0 and sent >= 0 and failed >= 0)
);

create index if not exists notification_automations_active_schedule_idx
  on public.notification_automations (is_active, send_time);

create index if not exists notification_automation_runs_recent_idx
  on public.notification_automation_runs (started_at desc);

create index if not exists notification_delivery_logs_recent_idx
  on public.notification_delivery_logs (created_at desc);

alter table public.notification_automations enable row level security;
alter table public.notification_automation_runs enable row level security;
alter table public.notification_delivery_logs enable row level security;

revoke all on table public.notification_automations from anon, authenticated;
revoke all on table public.notification_automation_runs from anon, authenticated;
revoke all on table public.notification_delivery_logs from anon, authenticated;

insert into public.notification_automations (
  system_key,
  name,
  content_type,
  audience_type,
  delivery_scope,
  timezone,
  send_time,
  days_of_week,
  is_active
)
values (
  'daily-motivation',
  'Günlük Motivasyon',
  'daily_motivation',
  'all',
  'all_devices',
  'Africa/Cairo',
  '07:30',
  array[0, 1, 2, 3, 4, 5, 6]::smallint[],
  true
)
on conflict (system_key) do nothing;

do $$
declare
  template_command text;
  dispatcher_command text;
  scheduled_job record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select command
    into template_command
    from cron.job
   where jobname in (
     'daily-motivation-egypt-window-1',
     'daily-motivation-egypt-window-2',
     'daily-motivation-egypt-window-3'
   )
   order by jobid
   limit 1;

  if template_command is null then
    raise notice 'Notification dispatcher was not scheduled because no authenticated template job was found.';
    return;
  end if;

  dispatcher_command := replace(
    template_command,
    '(select decrypted_secret from vault.decrypted_secrets where name = ''daily_motivation_url'' limit 1)',
    'replace((select decrypted_secret from vault.decrypted_secrets where name = ''daily_motivation_url'' limit 1), ''/api/send-notification'', ''/api/notification-automations'')'
  );

  if dispatcher_command = template_command then
    raise exception 'Notification dispatcher URL could not be derived from the existing authenticated job.';
  end if;

  for scheduled_job in
    select jobid
      from cron.job
     where jobname in (
       'daily-motivation-egypt-window-1',
       'daily-motivation-egypt-window-2',
       'daily-motivation-egypt-window-3',
       'notification-automation-dispatcher'
     )
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;

  perform cron.schedule(
    'notification-automation-dispatcher',
    '* * * * *',
    dispatcher_command
  );
end
$$;
