-- Human-readable database views for daily admin checks.
-- Original tables stay as the source of truth. Use *_readable views for review.

create index if not exists login_logs_user_created_at_idx
  on public.login_logs (user_id, created_at desc);

create index if not exists report_logs_user_created_at_idx
  on public.report_logs (user_id, created_at desc);

create index if not exists report_logs_created_at_idx
  on public.report_logs (created_at desc);

create index if not exists push_subscriptions_user_updated_at_idx
  on public.push_subscriptions (user_id, updated_at desc);

comment on table public.profiles is
  'Original user table. For readable admin review use public.user_profiles_readable.';

comment on table public.user_devices is
  'Original device approval table. For readable admin review use public.user_devices_readable.';

comment on table public.login_logs is
  'Original login audit log. For readable admin review use public.login_logs_readable.';

comment on table public.report_logs is
  'Original report audit log. For readable admin review use public.report_logs_readable.';

comment on table public.push_subscriptions is
  'Original push notification subscriptions. For readable admin review use public.push_subscriptions_readable.';

update public.profiles
set
  full_name = trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')),
  email = lower(trim(email))
where
  coalesce(full_name, '') <> trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g'))
  or email <> lower(trim(email));

create or replace function public.readable_user_name(
  p_full_name text,
  p_email text,
  p_user_id uuid
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    p_user_id::text
  );
$$;

create or replace function public.readable_browser_name(p_user_agent text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_user_agent, '')) like '%edg/%' then 'Microsoft Edge'
    when lower(coalesce(p_user_agent, '')) like '%opr/%'
      or lower(coalesce(p_user_agent, '')) like '%opera%' then 'Opera'
    when lower(coalesce(p_user_agent, '')) like '%firefox/%' then 'Firefox'
    when lower(coalesce(p_user_agent, '')) like '%samsungbrowser/%' then 'Samsung Internet'
    when lower(coalesce(p_user_agent, '')) like '%chrome/%'
      or lower(coalesce(p_user_agent, '')) like '%crios/%' then 'Google Chrome'
    when lower(coalesce(p_user_agent, '')) like '%safari/%' then 'Safari'
    when lower(coalesce(p_user_agent, '')) like '%wv%' then 'Android WebView'
    else 'Bilinmeyen tarayici'
  end;
$$;

create or replace function public.readable_operating_system(p_user_agent text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_user_agent, '')) like '%android%' then 'Android'
    when lower(coalesce(p_user_agent, '')) like '%iphone%'
      or lower(coalesce(p_user_agent, '')) like '%ipad%' then 'iOS'
    when lower(coalesce(p_user_agent, '')) like '%windows%' then 'Windows'
    when lower(coalesce(p_user_agent, '')) like '%mac os%' then 'macOS'
    when lower(coalesce(p_user_agent, '')) like '%linux%' then 'Linux'
    else 'Bilinmeyen sistem'
  end;
$$;

create or replace function public.readable_device_label(p_user_agent text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_user_agent, '') = '' then 'Bilinmeyen cihaz'
    when lower(p_user_agent) like '%iphone%' then 'iPhone'
    when lower(p_user_agent) like '%ipad%' then 'iPad'
    when lower(p_user_agent) like '%android%' and lower(p_user_agent) like '%wv%' then 'Android uygulama'
    when lower(p_user_agent) like '%android%' then 'Android tarayici'
    when lower(p_user_agent) like '%windows%' then 'Windows bilgisayar'
    when lower(p_user_agent) like '%macintosh%' or lower(p_user_agent) like '%mac os%' then 'Mac bilgisayar'
    else left(p_user_agent, 80)
  end;
$$;

revoke all on function public.readable_user_name(text, text, uuid) from public, anon, authenticated;
revoke all on function public.readable_browser_name(text) from public, anon, authenticated;
revoke all on function public.readable_operating_system(text) from public, anon, authenticated;
revoke all on function public.readable_device_label(text) from public, anon, authenticated;

grant execute on function public.readable_user_name(text, text, uuid) to service_role;
grant execute on function public.readable_browser_name(text) to service_role;
grant execute on function public.readable_operating_system(text) to service_role;
grant execute on function public.readable_device_label(text) to service_role;

drop view if exists public.database_overview_readable;
drop view if exists public.report_logs_readable;
drop view if exists public.login_logs_readable;
drop view if exists public.push_subscriptions_readable;
drop view if exists public.user_profiles_readable;
drop view if exists public.user_devices_readable;

create view public.user_devices_readable
with (security_invoker = true)
as
select
  d.id,
  d.user_id,
  public.readable_user_name(p.full_name, p.email, d.user_id) as user_name,
  split_part(coalesce(p.email, ''), '@', 1) as username,
  p.email as user_email,
  coalesce(p.role, 'user') as user_role,
  case when p.is_active is false then 'Pasif' else 'Aktif' end as user_status,
  left(d.device_hash, 12) as device_hash_short,
  public.readable_device_label(d.device_name) as device_label,
  public.readable_operating_system(d.device_name) as operating_system,
  public.readable_browser_name(d.device_name) as browser_name,
  d.status,
  case d.status
    when 'approved' then 'Onayli'
    when 'pending' then 'Onay bekliyor'
    when 'revoked' then 'Erisim kaldirildi'
    else d.status
  end as status_label,
  d.created_at,
  d.last_seen_at,
  case
    when d.last_seen_at is null then null
    else floor(extract(epoch from (now() - d.last_seen_at)) / 86400)::integer
  end as last_seen_days_ago,
  d.approved_at,
  d.approved_by,
  public.readable_user_name(approver.full_name, approver.email, d.approved_by) as approved_by_name,
  d.device_name as raw_device_name
from public.user_devices d
left join public.profiles p on p.id = d.user_id
left join public.profiles approver on approver.id = d.approved_by;

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
  concat_ws(
    ', ',
    case when p.can_view_fixing_report then 'Fixing' end,
    case when p.can_view_shipment_report then 'Sevkiyat' end
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

create view public.login_logs_readable
with (security_invoker = true)
as
select
  l.id,
  l.user_id,
  public.readable_user_name(p.full_name, p.email, l.user_id) as user_name,
  split_part(coalesce(p.email, ''), '@', 1) as username,
  p.email as user_email,
  l.event_type,
  case l.event_type
    when 'login' then 'Giris'
    when 'logout' then 'Cikis'
    else l.event_type
  end as event_label,
  public.readable_device_label(l.device_name) as device_label,
  public.readable_operating_system(l.device_name) as operating_system,
  public.readable_browser_name(l.device_name) as browser_name,
  l.app_version,
  l.created_at,
  l.device_name as raw_device_name
from public.login_logs l
left join public.profiles p on p.id = l.user_id;

create view public.report_logs_readable
with (security_invoker = true)
as
select
  r.id,
  r.user_id,
  public.readable_user_name(p.full_name, p.email, r.user_id) as user_name,
  split_part(coalesce(p.email, ''), '@', 1) as username,
  p.email as user_email,
  r.barcode,
  r.report_code,
  r.report_name,
  public.readable_device_label(r.device_name) as device_label,
  public.readable_operating_system(r.device_name) as operating_system,
  public.readable_browser_name(r.device_name) as browser_name,
  r.app_version,
  r.created_at,
  r.device_name as raw_device_name
from public.report_logs r
left join public.profiles p on p.id = r.user_id;

create view public.push_subscriptions_readable
with (security_invoker = true)
as
select
  s.id,
  s.user_id,
  public.readable_user_name(p.full_name, p.email, s.user_id) as user_name,
  split_part(coalesce(p.email, ''), '@', 1) as username,
  p.email as user_email,
  coalesce(p.role, 'user') as user_role,
  case when p.is_active is false then 'Pasif' else 'Aktif' end as user_status,
  public.readable_device_label(s.user_agent) as device_label,
  public.readable_browser_name(s.user_agent) as browser_name,
  public.readable_operating_system(s.user_agent) as operating_system,
  split_part(s.endpoint, '/', 3) as notification_provider,
  right(s.endpoint, 18) as endpoint_tail,
  s.created_at,
  s.updated_at,
  s.user_agent as raw_user_agent
from public.push_subscriptions s
left join public.profiles p on p.id = s.user_id;

create view public.database_overview_readable
with (security_invoker = true)
as
select 'Kullanicilar' as title, count(*)::bigint as total from public.profiles
union all
select 'Aktif kullanicilar', count(*)::bigint from public.profiles where is_active is not false
union all
select 'Pasif kullanicilar', count(*)::bigint from public.profiles where is_active is false
union all
select 'Onayli cihazlar', count(*)::bigint from public.user_devices where status = 'approved'
union all
select 'Onay bekleyen cihazlar', count(*)::bigint from public.user_devices where status = 'pending'
union all
select 'Izni kaldirilmis cihazlar', count(*)::bigint from public.user_devices where status = 'revoked'
union all
select 'Giris loglari', count(*)::bigint from public.login_logs
union all
select 'Rapor loglari', count(*)::bigint from public.report_logs
union all
select 'Push kayitlari', count(*)::bigint from public.push_subscriptions;

revoke all on public.user_devices_readable from public, anon, authenticated;
revoke all on public.user_profiles_readable from public, anon, authenticated;
revoke all on public.login_logs_readable from public, anon, authenticated;
revoke all on public.report_logs_readable from public, anon, authenticated;
revoke all on public.push_subscriptions_readable from public, anon, authenticated;
revoke all on public.database_overview_readable from public, anon, authenticated;

grant select on public.user_devices_readable to service_role;
grant select on public.user_profiles_readable to service_role;
grant select on public.login_logs_readable to service_role;
grant select on public.report_logs_readable to service_role;
grant select on public.push_subscriptions_readable to service_role;
grant select on public.database_overview_readable to service_role;
