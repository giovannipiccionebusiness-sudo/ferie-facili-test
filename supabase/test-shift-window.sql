begin;
grant usage on schema private to service_role;
create or replace function private.test_shift_window(p_worker uuid,p_day date) returns table(remind_at timestamptz,end_at timestamptz) language sql set search_path='' as $$
 with current_shift as (select * from public.test_worker_shifts where worker_id=p_worker and valid_from<=p_day order by valid_from desc limit 1),
 last_slot as (select slot from current_shift cross join lateral jsonb_array_elements(schedule->(extract(isodow from p_day)::int-1)) with ordinality s(slot,ord) where enabled order by ord desc limit 1),
 finish as (select (p_day+(slot->>'end')::time+case when (slot->>'end')::time<(slot->>'start')::time then interval '1 day' else interval '0 day' end) at time zone 'Europe/Rome' as ts from last_slot)
 select ts-interval '30 minutes',ts from finish;
$$;
commit;
