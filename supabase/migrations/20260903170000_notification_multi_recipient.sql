alter table public.notification_automations
  add column if not exists target_user_ids uuid[];

alter table public.notification_delivery_logs
  add column if not exists target_user_ids uuid[];

update public.notification_automations
   set target_user_ids = array[target_user_id]::uuid[]
 where audience_type = 'user'
   and target_user_id is not null
   and target_user_ids is null;

update public.notification_delivery_logs
   set target_user_ids = array[target_user_id]::uuid[]
 where target_user_id is not null
   and target_user_ids is null;

create or replace function public.normalize_notification_automation_targets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.audience_type = 'all' then
    new.target_user_id := null;
    new.target_user_ids := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.target_user_id is distinct from old.target_user_id
       and new.target_user_ids is not distinct from old.target_user_ids then
      new.target_user_ids := array[new.target_user_id]::uuid[];
    end if;
  end if;

  if new.target_user_ids is null and new.target_user_id is not null then
    new.target_user_ids := array[new.target_user_id]::uuid[];
  end if;

  if cardinality(new.target_user_ids) > 0 then
    new.target_user_id := new.target_user_ids[1];
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_notification_automation_targets
  on public.notification_automations;

create trigger normalize_notification_automation_targets
before insert or update of audience_type, target_user_id, target_user_ids
on public.notification_automations
for each row
execute function public.normalize_notification_automation_targets();

alter table public.notification_automations
  drop constraint if exists notification_automations_target_check;

alter table public.notification_automations
  add constraint notification_automations_target_check
  check (
    (
      audience_type = 'all'
      and target_user_id is null
      and target_user_ids is null
    )
    or (
      audience_type = 'user'
      and target_user_id is not null
      and cardinality(target_user_ids) between 1 and 100
      and target_user_id = target_user_ids[1]
      and array_position(target_user_ids, null) is null
    )
  );

alter table public.notification_delivery_logs
  drop constraint if exists notification_delivery_logs_targets_check;

alter table public.notification_delivery_logs
  add constraint notification_delivery_logs_targets_check
  check (
    target_user_ids is null
    or (
      cardinality(target_user_ids) between 1 and 100
      and array_position(target_user_ids, null) is null
    )
  );

create index if not exists notification_automations_target_user_ids_idx
  on public.notification_automations using gin (target_user_ids);

comment on column public.notification_automations.target_user_ids is
  'Ordered, deduplicated recipient IDs for targeted notification automations (maximum 100).';

comment on column public.notification_delivery_logs.target_user_ids is
  'Recipient IDs recorded for a targeted notification delivery (maximum 100).';
