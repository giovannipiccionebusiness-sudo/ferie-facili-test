begin;
create table public.test_worker_shifts(
 worker_id uuid not null references public.profiles(id) on delete cascade,
 valid_from date not null,schedule jsonb not null,enabled boolean not null default true,
 version integer not null default 1,updated_at timestamptz not null default now(),primary key(worker_id,valid_from)
);
alter table public.test_worker_shifts enable row level security;
revoke all on public.test_worker_shifts from public,anon,authenticated;
grant select on public.test_worker_shifts to authenticated;
grant all on public.test_worker_shifts to service_role;
create policy shifts_read on public.test_worker_shifts for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or (p.role='worker' and p.id=worker_id))));
create function private.save_test_worker_shifts(p_worker uuid,p_from date,p_schedule jsonb,p_enabled boolean,p_expected_version integer default null) returns void language plpgsql security definer set search_path='' as $$
declare v integer;day_slots jsonb;slot jsonb;i integer:=0;start_min int;end_min int;previous_end int;first_starts int[]:='{}';last_ends int[]:='{}';first_start int;day_total int;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active) then raise exception 'Accesso amministratore necessario';end if;
 if not exists(select 1 from public.profiles where id=p_worker and role='worker') or p_from is null or p_enabled is null or p_schedule is null or jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>7 then raise exception 'Lavoratore, decorrenza o settimana non validi';end if;
 perform pg_advisory_xact_lock(hashtextextended('test-shifts:'||p_worker::text,0));
 select version into v from public.test_worker_shifts where worker_id=p_worker and valid_from=p_from;
 if v is distinct from p_expected_version then raise exception 'Fasce cambiate: ricarica prima di salvare';end if;
 for day_slots in select value from jsonb_array_elements(p_schedule) loop
 if jsonb_typeof(day_slots)<>'array' or jsonb_array_length(day_slots)>2 then raise exception 'Massimo due fasce per giorno';end if;
 previous_end:=0;first_start:=null;day_total:=0;
 for slot in select value from jsonb_array_elements(day_slots) loop
 if jsonb_typeof(slot)<>'object' or jsonb_typeof(slot->'start') is distinct from 'string' or jsonb_typeof(slot->'end') is distinct from 'string' or slot->>'start'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or slot->>'end'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Inserisci entrata e uscita in formato HH:MM';end if;
 start_min:=substring(slot->>'start',1,2)::int*60+substring(slot->>'start',4,2)::int;
 end_min:=substring(slot->>'end',1,2)::int*60+substring(slot->>'end',4,2)::int;
 if start_min=end_min then raise exception 'Entrata e uscita non possono coincidere';end if;
 if end_min<start_min then end_min:=end_min+1440;end if;
 if end_min-start_min<30 or start_min<previous_end then raise exception 'Fasce sovrapposte, non ordinate o inferiori a 30 minuti';end if;
 first_start:=coalesce(first_start,start_min);previous_end:=end_min;day_total:=day_total+end_min-start_min;
 end loop;
 if day_total>1440 then raise exception 'Totale giornaliero oltre 24 ore';end if;
 first_starts:=array_append(first_starts,first_start);last_ends:=array_append(last_ends,case when first_start is null then null else previous_end end);
 end loop;
 for i in 1..7 loop
 if last_ends[i]>1440 and first_starts[case when i=7 then 1 else i+1 end] is not null and last_ends[i]-1440>first_starts[case when i=7 then 1 else i+1 end] then raise exception 'Il turno notturno si sovrappone al giorno successivo';end if;
 end loop;
 if p_enabled and not exists(select 1 from jsonb_array_elements(p_schedule) d where jsonb_array_length(d)>0) then raise exception 'Inserisci almeno una fascia o disattiva il promemoria';end if;
 insert into public.test_worker_shifts(worker_id,valid_from,schedule,enabled,version) values(p_worker,p_from,p_schedule,p_enabled,coalesce(v,0)+1)
 on conflict(worker_id,valid_from) do update set schedule=excluded.schedule,enabled=excluded.enabled,version=excluded.version,updated_at=now();
end $$;
revoke all on function private.save_test_worker_shifts(uuid,date,jsonb,boolean,integer) from public,anon;
grant execute on function private.save_test_worker_shifts(uuid,date,jsonb,boolean,integer) to authenticated;
create function public.save_test_worker_shifts(p_worker uuid,p_from date,p_schedule jsonb,p_enabled boolean,p_expected_version integer default null) returns void language sql security invoker set search_path='' as $$select private.save_test_worker_shifts(p_worker,p_from,p_schedule,p_enabled,p_expected_version)$$;
revoke all on function public.save_test_worker_shifts(uuid,date,jsonb,boolean,integer) from public,anon;
grant execute on function public.save_test_worker_shifts(uuid,date,jsonb,boolean,integer) to authenticated;
-- The old worker preference setter can no longer change reminder settings.
revoke execute on function public.save_test_daily_preferences(boolean,time,integer[]),private.save_test_daily_preferences(boolean,time,integer[]) from authenticated;
create function private.test_shift_window(p_worker uuid,p_day date) returns table(remind_at timestamptz,end_at timestamptz) language sql set search_path='' as $$
 with current_shift as (select * from public.test_worker_shifts where worker_id=p_worker and valid_from<=p_day order by valid_from desc limit 1),
 last_slot as (select slot from current_shift cross join lateral jsonb_array_elements(schedule->(extract(isodow from p_day)::int-1)) with ordinality s(slot,ord) where enabled order by ord desc limit 1),
 finish as (select p_day+(slot->>'end')::time+case when (slot->>'end')::time<(slot->>'start')::time then interval '1 day' else interval '0 day' end as ts from last_slot)
 select (ts-interval '30 minutes') at time zone 'Europe/Rome',ts at time zone 'Europe/Rome' from finish;
$$;
revoke all on function private.test_shift_window(uuid,date) from public,anon,authenticated;
create or replace function private.test_collect_daily_presence(at_time timestamptz default now()) returns void language plpgsql set search_path='' as $$
declare ld date:=(at_time at time zone 'Europe/Rome')::date;
begin
 insert into public.test_daily_notices(worker_id,day,kind,created_at)
 select p.id,work_day,case when extract(isodow from work_day)=5 then 'week' else 'day' end,at_time
 from public.profiles p cross join lateral (values(ld-1),(ld)) days(work_day)
 cross join lateral private.test_shift_window(p.id,work_day) w
 where p.active and p.role='worker' and at_time>=w.remind_at and at_time<w.end_at
 and ((extract(isodow from work_day)<>5 and not exists(select 1 from public.test_daily_presence dp where dp.worker_id=p.id and dp.day=work_day)) or
 (extract(isodow from work_day)=5 and not exists(select 1 from public.test_presence_week_confirmations wc where wc.worker_id=p.id and wc.week_ending=work_day and wc.confirmed_at>=coalesce((select max(updated_at) from public.test_daily_presence dp where dp.worker_id=p.id and dp.day between work_day-4 and work_day),'-infinity'::timestamptz))))
 on conflict(worker_id,day,kind) do nothing;
 insert into public.test_daily_deliveries(notice_id,subscription_id)
 select n.id,s.id from public.test_daily_notices n join public.test_push_subscriptions s on s.user_id=n.worker_id and s.app_scope='test' and s.push_keys is not null
 cross join lateral private.test_shift_window(n.worker_id,n.day) w
 where n.day between ld-1 and ld and at_time>=w.remind_at and at_time<w.end_at and n.read_at is null on conflict do nothing;
 update public.test_daily_deliveries set state='failed' where state='sending' and attempted_at<now()-interval '10 minutes';
 update public.test_daily_deliveries d set state='skipped' where state='pending' and not exists(select 1 from public.test_daily_notices n cross join lateral private.test_shift_window(n.worker_id,n.day) w where n.id=d.notice_id and n.read_at is null and at_time>=w.remind_at and at_time<w.end_at);
end $$;
create function public.test_shift_notice_needed(p_worker uuid,p_day date,p_kind text) returns boolean language sql set search_path='' as $$
 select exists(select 1 from private.test_shift_window(p_worker,p_day) w join public.profiles p on p.id=p_worker and p.active and p.role='worker' where now()>=w.remind_at and now()<w.end_at
 and ((p_kind='day' and not exists(select 1 from public.test_daily_presence where worker_id=p_worker and day=p_day)) or (p_kind='week' and not exists(select 1 from public.test_presence_week_confirmations wc where wc.worker_id=p_worker and wc.week_ending=p_day and wc.confirmed_at>=coalesce((select max(updated_at) from public.test_daily_presence dp where dp.worker_id=p_worker and dp.day between p_day-4 and p_day),'-infinity'::timestamptz)))));
$$;
revoke all on function public.test_shift_notice_needed(uuid,date,text) from public,anon,authenticated;
grant execute on function public.test_shift_notice_needed(uuid,date,text) to service_role;
grant execute on function private.test_shift_window(uuid,date) to service_role;
commit;
