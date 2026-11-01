begin;
-- Private implementations enforce the authenticated worker and use a fixed search path.
alter function public.save_test_daily_presence(jsonb,integer) set schema private;
alter function public.save_test_presence_week(date,jsonb,jsonb,uuid,integer) set schema private;
alter function public.save_test_daily_preferences(boolean,time,integer[]) set schema private;
alter function public.read_test_daily_notice(uuid) set schema private;
grant usage on schema private to authenticated;
create function public.save_test_daily_presence(p_entry jsonb,p_expected_version integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.save_test_daily_presence(p_entry,p_expected_version)$$;
create function public.save_test_presence_week(p_week_ending date,p_entries jsonb,p_versions jsonb,p_document uuid default null,p_week_version integer default null) returns void language sql security invoker set search_path='' as $$select private.save_test_presence_week(p_week_ending,p_entries,p_versions,p_document,p_week_version)$$;
create function public.save_test_daily_preferences(p_enabled boolean,p_time time,p_weekdays integer[]) returns void language sql security invoker set search_path='' as $$select private.save_test_daily_preferences(p_enabled,p_time,p_weekdays)$$;
create function public.read_test_daily_notice(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.read_test_daily_notice(p_id)$$;
revoke all on function public.save_test_daily_presence(jsonb,integer),public.save_test_presence_week(date,jsonb,jsonb,uuid,integer),public.save_test_daily_preferences(boolean,time,integer[]),public.read_test_daily_notice(uuid) from public,anon;
grant execute on function public.save_test_daily_presence(jsonb,integer),public.save_test_presence_week(date,jsonb,jsonb,uuid,integer),public.save_test_daily_preferences(boolean,time,integer[]),public.read_test_daily_notice(uuid) to authenticated;
commit;
