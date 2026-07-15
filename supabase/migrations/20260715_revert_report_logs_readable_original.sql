-- Revert report_logs_readable to the original readable view shape.
-- No extra columns, no report name rewriting, no forced ordering in the view.

drop view if exists public.report_logs_readable;
drop function if exists public.readable_report_name(text, text);

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

revoke all on public.report_logs_readable from public, anon, authenticated;
grant select on public.report_logs_readable to service_role;
