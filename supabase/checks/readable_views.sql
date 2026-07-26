-- Read-only check for the current readable view definitions and column order.

select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname in (
    'user_profiles_readable',
    'user_devices_readable',
    'login_logs_readable',
    'report_logs_readable',
    'push_subscriptions_readable',
    'database_overview_readable'
  )
order by viewname;

select
  table_name,
  ordinal_position,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name like '%\_readable' escape '\'
order by table_name, ordinal_position;
