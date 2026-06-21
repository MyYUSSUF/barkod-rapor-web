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
  v_is_admin boolean := false;
  v_device_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if p_device_hash is null or length(trim(p_device_hash)) < 32 then
    raise exception 'Gecersiz cihaz anahtari.';
  end if;

  select (role = 'admin')
    into v_is_admin
  from public.profiles
  where id = v_user_id
    and is_active is not false
  for update;

  if not found then
    raise exception 'Aktif kullanici profili bulunamadi.';
  end if;

  select count(*)
    into v_device_count
  from public.user_devices
  where user_id = v_user_id;

  select d.status
    into v_status
  from public.user_devices d
  where d.user_id = v_user_id
    and d.device_hash = trim(p_device_hash);

  if found then
    if v_status = 'pending'
      and (
        v_device_count = 1
        or (
          v_is_admin
          and not exists (
            select 1
            from public.user_devices existing_device
            where existing_device.user_id = v_user_id
              and existing_device.status = 'approved'
          )
        )
      )
    then
      v_status := 'approved';
    end if;

    update public.user_devices target_device
    set device_name = left(coalesce(p_device_name, ''), 500),
        status = v_status,
        last_seen_at = now(),
        approved_at = case
          when v_status = 'approved' then coalesce(target_device.approved_at, now())
          else target_device.approved_at
        end
    where target_device.user_id = v_user_id
      and target_device.device_hash = trim(p_device_hash);

    return query select v_status;
    return;
  end if;

  if v_device_count = 0
    or (
      v_is_admin
      and not exists (
        select 1
        from public.user_devices existing_device
        where existing_device.user_id = v_user_id
          and existing_device.status = 'approved'
      )
    )
  then
    v_status := 'approved';
  else
    v_status := 'pending';
  end if;

  insert into public.user_devices (
    user_id,
    device_hash,
    device_name,
    status,
    approved_at
  )
  values (
    v_user_id,
    trim(p_device_hash),
    left(coalesce(p_device_name, ''), 500),
    v_status,
    case when v_status = 'approved' then now() else null end
  );

  return query select v_status;
end;
$$;

revoke all on function public.request_device_access(text, text) from public, anon;
grant execute on function public.request_device_access(text, text) to authenticated;
