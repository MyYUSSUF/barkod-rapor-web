alter table public.profiles
  add column if not exists can_view_fixing_report boolean not null default false,
  add column if not exists can_view_shipment_report boolean not null default false;

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
  max(d.last_seen_at) as last_device_seen_at,
  p.can_view_fixing_report,
  p.can_view_shipment_report
from public.profiles p
left join public.user_devices d on d.user_id = p.id
group by
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.is_active,
  p.can_view_fixing_report,
  p.can_view_shipment_report;

revoke all on public.user_profiles_readable from public, anon, authenticated;
grant select on public.user_profiles_readable to service_role;
