create or replace view public.push_subscriptions_readable
with (security_invoker = true)
as
select
  s.id,
  s.user_id,
  coalesce(nullif(trim(p.full_name), ''), p.email, s.user_id::text) as user_name,
  p.email as user_email,
  coalesce(p.role, 'user') as user_role,
  case
    when p.is_active is false then 'Pasif'
    else 'Aktif'
  end as user_status,
  case
    when lower(coalesce(s.user_agent, '')) like '%edg/%' then 'Microsoft Edge'
    when lower(coalesce(s.user_agent, '')) like '%opr/%' then 'Opera'
    when lower(coalesce(s.user_agent, '')) like '%firefox/%' then 'Firefox'
    when lower(coalesce(s.user_agent, '')) like '%chrome/%' then 'Google Chrome'
    when lower(coalesce(s.user_agent, '')) like '%safari/%' then 'Safari'
    else 'Bilinmeyen tarayici'
  end as browser_name,
  case
    when lower(coalesce(s.user_agent, '')) like '%android%' then 'Android'
    when lower(coalesce(s.user_agent, '')) like '%iphone%'
      or lower(coalesce(s.user_agent, '')) like '%ipad%' then 'iOS'
    when lower(coalesce(s.user_agent, '')) like '%windows%' then 'Windows'
    when lower(coalesce(s.user_agent, '')) like '%mac os%' then 'macOS'
    when lower(coalesce(s.user_agent, '')) like '%linux%' then 'Linux'
    else 'Bilinmeyen sistem'
  end as operating_system,
  split_part(s.endpoint, '/', 3) as notification_provider,
  s.user_agent,
  s.created_at,
  s.updated_at
from public.push_subscriptions s
left join public.profiles p on p.id = s.user_id;

revoke all on public.push_subscriptions_readable from public, anon, authenticated;
grant select on public.push_subscriptions_readable to service_role;
