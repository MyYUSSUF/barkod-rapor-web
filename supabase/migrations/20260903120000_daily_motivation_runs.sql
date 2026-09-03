create table if not exists public.daily_motivation_runs (
  run_date date primary key,
  message_id smallint not null check (message_id between 1 and 90),
  status text not null default 'started'
    check (status in ('started', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  delivery_summary jsonb
);

alter table public.daily_motivation_runs enable row level security;

revoke all on table public.daily_motivation_runs from anon, authenticated;

comment on table public.daily_motivation_runs is
  'Server-only daily motivation execution log and idempotency key.';

-- The table may already exist if the setup SQL was run manually. Keep the
-- status constraint upgrade idempotent in that case too.
alter table public.daily_motivation_runs
  drop constraint if exists daily_motivation_runs_status_check;
alter table public.daily_motivation_runs
  add constraint daily_motivation_runs_status_check
  check (status in ('started', 'completed', 'partial', 'failed'));

create or replace function public.claim_daily_motivation_run(
  p_run_date date,
  p_message_id smallint,
  p_lease_minutes integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed_date date;
begin
  if p_lease_minutes < 1 or p_lease_minutes > 60 then
    raise exception 'Invalid lease duration';
  end if;

  insert into public.daily_motivation_runs (
    run_date,
    message_id,
    status,
    started_at,
    finished_at,
    delivery_summary
  )
  values (
    p_run_date,
    p_message_id,
    'started',
    now(),
    null,
    null
  )
  on conflict (run_date) do update
  set
    message_id = excluded.message_id,
    status = 'started',
    started_at = now(),
    finished_at = null,
    delivery_summary = null
  where
    daily_motivation_runs.status = 'failed'
    or (
      daily_motivation_runs.status = 'started'
      and daily_motivation_runs.started_at <
        now() - make_interval(mins => p_lease_minutes)
    )
  returning run_date into v_claimed_date;

  return v_claimed_date is not null;
end;
$$;

revoke all on function public.claim_daily_motivation_run(date, smallint, integer)
  from public, anon, authenticated;
grant execute on function public.claim_daily_motivation_run(date, smallint, integer)
  to service_role;
