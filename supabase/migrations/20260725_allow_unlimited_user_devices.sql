-- Yeni cihazlar yönetici onayı beklemeden kullanılabilir.
-- Yönetici tarafından erişimi kaldırılmış cihazlar engelli kalır.

begin;

alter table public.user_devices
  alter column status set default 'approved';

update public.user_devices
set status = 'approved',
    approved_at = coalesce(approved_at, now()),
    approved_by = null
where status = 'pending';

create or replace function public.request_device_access(
  p_device_hash text,
  p_device_name text default ''
)
returns table (
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if p_device_hash is null or length(trim(p_device_hash)) < 32 then
    raise exception 'Gecersiz cihaz anahtari.';
  end if;

  perform 1
  from public.profiles
  where id = v_user_id
    and is_active is not false
  for update;

  if not found then
    raise exception 'Aktif kullanici profili bulunamadi.';
  end if;

  select d.status
    into v_status
  from public.user_devices d
  where d.user_id = v_user_id
    and d.device_hash = trim(p_device_hash);

  if found then
    if v_status <> 'revoked' then
      v_status := 'approved';
    end if;

    update public.user_devices target_device
    set device_name = left(coalesce(p_device_name, ''), 500),
        status = v_status,
        last_seen_at = now(),
        approved_at = case
          when v_status = 'approved' then coalesce(target_device.approved_at, now())
          else target_device.approved_at
        end,
        approved_by = case
          when target_device.status = 'pending' then null
          else target_device.approved_by
        end
    where target_device.user_id = v_user_id
      and target_device.device_hash = trim(p_device_hash);

    return query select v_status;
    return;
  end if;

  insert into public.user_devices (
    user_id,
    device_hash,
    device_name,
    status,
    approved_at,
    approved_by
  )
  values (
    v_user_id,
    trim(p_device_hash),
    left(coalesce(p_device_name, ''), 500),
    'approved',
    now(),
    null
  );

  return query select 'approved'::text;
end;
$$;

create or replace function public.check_device_access(
  p_device_hash text
)
returns table (
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  select d.status
    into v_status
  from public.user_devices d
  where d.user_id = v_user_id
    and d.device_hash = trim(p_device_hash);

  if not found then
    return query select 'missing'::text;
    return;
  end if;

  if v_status = 'pending' then
    v_status := 'approved';
  end if;

  update public.user_devices target_device
  set status = v_status,
      last_seen_at = now(),
      approved_at = case
        when v_status = 'approved' then coalesce(target_device.approved_at, now())
        else target_device.approved_at
      end,
      approved_by = case
        when target_device.status = 'pending' then null
        else target_device.approved_by
      end
  where target_device.user_id = v_user_id
    and target_device.device_hash = trim(p_device_hash);

  return query select v_status;
end;
$$;

revoke all on function public.request_device_access(text, text) from public, anon;
revoke all on function public.check_device_access(text) from public, anon;

grant execute on function public.request_device_access(text, text) to authenticated;
grant execute on function public.check_device_access(text) to authenticated;

commit;
