-- Standardize report names in the readable report log view.
-- The original report name remains available as raw_report_name.

create or replace function public.readable_report_name(
  p_report_code text,
  p_report_name text
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case p_report_code
      when 'RAR00032' then 'Inspection Raporu'
      when 'RAR00033' then 'Is Emri Raporu'
      when 'RAR00034' then 'Yuzey Kontrol Raporu'
      when 'RAR00035' then 'Fikse Bekleyenler'
      when 'RAR00036' then 'Sevkiyat Takip'
      when 'RAR00037' then 'Iplik Stok Raporu'
      else null
    end,
    nullif(trim(coalesce(p_report_name, '')), ''),
    nullif(trim(coalesce(p_report_code, '')), ''),
    'Bilinmeyen rapor'
  );
$$;

revoke all on function public.readable_report_name(text, text) from public, anon, authenticated;
grant execute on function public.readable_report_name(text, text) to service_role;

drop view if exists public.report_logs_readable;

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
  public.readable_report_name(r.report_code, r.report_name) as report_name,
  r.report_name as raw_report_name,
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
