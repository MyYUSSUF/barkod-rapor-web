create or replace view public.user_devices_readable
with (security_invoker = true)
as
select
  d.id,
  d.user_id,
  coalesce(nullif(trim(p.full_name), ''), p.email, d.user_id::text) as user_name,
  p.email as user_email,
  coalesce(p.role, 'user') as user_role,
  case
    when p.is_active is false then 'Pasif'
    else 'Aktif'
  end as user_status,
  d.device_name,
  d.status,
  case d.status
    when 'approved' then 'Onayli'
    when 'pending' then 'Onay bekliyor'
    when 'revoked' then 'Erisim kaldirildi'
    else d.status
  end as status_label,
  d.created_at,
  d.last_seen_at,
  d.approved_at,
  d.approved_by,
  coalesce(
    nullif(trim(approver.full_name), ''),
    approver.email,
    d.approved_by::text
  ) as approved_by_name
from public.user_devices d
left join public.profiles p on p.id = d.user_id
left join public.profiles approver on approver.id = d.approved_by;

create or replace view public.user_profiles_readable
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.email,
  p.role,
  case
    when p.role = 'admin' then 'Yonetici'
    else 'Kullanici'
  end as role_label,
  p.is_active,
  case
    when p.is_active is false then 'Pasif'
    else 'Aktif'
  end as status_label,
  count(d.id) filter (where d.status = 'approved') as approved_device_count,
  count(d.id) filter (where d.status = 'pending') as pending_device_count,
  count(d.id) filter (where d.status = 'revoked') as revoked_device_count,
  max(d.last_seen_at) as last_device_seen_at
from public.profiles p
left join public.user_devices d on d.user_id = p.id
group by p.id, p.full_name, p.email, p.role, p.is_active;

revoke all on public.user_devices_readable from public, anon, authenticated;
revoke all on public.user_profiles_readable from public, anon, authenticated;

grant select on public.user_devices_readable to service_role;
grant select on public.user_profiles_readable to service_role;
