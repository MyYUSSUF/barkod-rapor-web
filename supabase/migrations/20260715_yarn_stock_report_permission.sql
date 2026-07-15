alter table public.profiles
  add column if not exists can_view_yarn_stock_report boolean not null default false;

drop view if exists public.user_profiles_readable;

create view public.user_profiles_readable
with (security_invoker = true)
as
select
  p.id,
  public.readable_user_name(p.full_name, p.email, p.id) as user_name,
  split_part(coalesce(p.email, ''), '@', 1) as username,
  p.full_name,
  p.email,
  p.role,
  case when p.role = 'admin' then 'Yonetici' else 'Kullanici' end as role_label,
  p.is_active,
  case when p.is_active is false then 'Pasif' else 'Aktif' end as status_label,
  coalesce(device_summary.approved_device_count, 0) as approved_device_count,
  coalesce(device_summary.pending_device_count, 0) as pending_device_count,
  coalesce(device_summary.revoked_device_count, 0) as revoked_device_count,
  device_summary.last_device_seen_at,
  login_summary.last_login_at,
  report_summary.last_report_at,
  coalesce(push_summary.push_subscription_count, 0) as push_subscription_count,
  p.can_view_fixing_report,
  p.can_view_shipment_report,
  p.can_view_yarn_stock_report,
  concat_ws(
    ', ',
    case when p.can_view_fixing_report then 'Fixing' end,
    case when p.can_view_shipment_report then 'Sevkiyat' end,
    case when p.can_view_yarn_stock_report then 'Iplik Stok' end
  ) as report_permissions
from public.profiles p
left join (
  select
    user_id,
    count(*) filter (where status = 'approved') as approved_device_count,
    count(*) filter (where status = 'pending') as pending_device_count,
    count(*) filter (where status = 'revoked') as revoked_device_count,
    max(last_seen_at) as last_device_seen_at
  from public.user_devices
  group by user_id
) device_summary on device_summary.user_id = p.id
left join (
  select user_id, max(created_at) as last_login_at
  from public.login_logs
  where event_type = 'login'
  group by user_id
) login_summary on login_summary.user_id = p.id
left join (
  select user_id, max(created_at) as last_report_at
  from public.report_logs
  group by user_id
) report_summary on report_summary.user_id = p.id
left join (
  select user_id, count(*) as push_subscription_count
  from public.push_subscriptions
  group by user_id
) push_summary on push_summary.user_id = p.id;

revoke all on public.user_profiles_readable from public, anon, authenticated;
grant select on public.user_profiles_readable to service_role;
