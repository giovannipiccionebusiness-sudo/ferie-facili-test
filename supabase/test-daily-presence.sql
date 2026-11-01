begin;
create table public.test_daily_presence(
 worker_id uuid not null references public.profiles(id) on delete cascade,day date not null,
 supplementary_minutes integer not null default 0 check(supplementary_minutes between 0 and 1440),
 cause text not null default '' check(cause in ('','F','M','L104','PHR','congedo parentale')),
 absence_scope text,absence_minutes integer,version integer not null default 1,
 updated_at timestamptz not null default now(),primary key(worker_id,day),
 check((cause='' and absence_scope is null and absence_minutes is null) or (cause<>'' and ((absence_scope='full' and absence_minutes is null) or (absence_scope='partial' and absence_minutes between 1 and 1440)))),
 check(supplementary_minutes+coalesce(absence_minutes,0)<=1440)
);
create table public.test_daily_preferences(
 worker_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,reminder_time time not null,
 weekdays integer[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
 updated_at timestamptz not null default now()
);
create table public.test_presence_week_confirmations(worker_id uuid not null references public.profiles(id) on delete cascade,week_ending date not null,confirmed_at timestamptz not null default now(),primary key(worker_id,week_ending));
create table public.test_daily_notices(
 id uuid primary key default gen_random_uuid(),worker_id uuid not null references public.profiles(id) on delete cascade,
 day date not null,kind text not null check(kind in ('day','week')),created_at timestamptz not null default now(),read_at timestamptz,unique(worker_id,day,kind)
);
create table public.test_daily_deliveries(
 notice_id uuid not null references public.test_daily_notices(id) on delete cascade,
 subscription_id uuid not null references public.test_push_subscriptions(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),attempts integer not null default 0,attempted_at timestamptz,primary key(notice_id,subscription_id)
);
DO $$declare t text;begin
 foreach t in array array['test_daily_presence','test_daily_preferences','test_presence_week_confirmations','test_daily_notices','test_daily_deliveries'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.test_daily_presence,public.test_daily_preferences,public.test_presence_week_confirmations,public.test_daily_notices to authenticated;
create policy daily_read on public.test_daily_presence for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or (p.role='worker' and p.id=worker_id))));
create policy prefs_read on public.test_daily_preferences for select to authenticated using(worker_id=(select auth.uid()));
create policy confirmation_read on public.test_presence_week_confirmations for select to authenticated using(worker_id=(select auth.uid()));
create policy notice_read on public.test_daily_notices for select to authenticated using(worker_id=(select auth.uid()));
-- Writes go through narrow RPCs; no direct writes can bypass versions or validation.
create function private.test_presence_actor() returns uuid language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;return auth.uid();end $$;
revoke all on function private.test_presence_actor() from public,anon,authenticated;
create function public.save_test_daily_presence(p_entry jsonb,p_expected_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.test_presence_actor();dt date;v integer;r public.test_daily_presence;s integer;a integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('test-presence:'||actor::text,0));
 if jsonb_typeof(p_entry)<>'object' or not(p_entry ?& array['day','supplementary_minutes','cause','absence_scope','absence_minutes']) or jsonb_typeof(p_entry->'day')<>'string' or (p_entry->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Riga incompleta';end if;
 dt:=(p_entry->>'day')::date;if dt>(now() at time zone 'Europe/Rome')::date then raise exception 'Non puoi compilare giorni futuri';end if;
 if jsonb_typeof(p_entry->'supplementary_minutes')<>'number' or (p_entry->>'supplementary_minutes')!~'^\d+$' or jsonb_typeof(p_entry->'cause')<>'string' then raise exception 'Ore o giustificativo non validi';end if;
 s:=(p_entry->>'supplementary_minutes')::integer;
 if p_entry->>'absence_minutes' is not null then
 if jsonb_typeof(p_entry->'absence_minutes')<>'number' or (p_entry->>'absence_minutes')!~'^\d+$' then raise exception 'Minuti non validi';end if;a:=(p_entry->>'absence_minutes')::integer;end if;
 if (p_entry->>'cause'='' and (p_entry->>'absence_scope' is not null or a is not null)) or (p_entry->>'cause'<>'' and (p_entry->>'absence_scope' is null or p_entry->>'absence_scope' not in ('full','partial') or (p_entry->>'absence_scope'='partial' and (a is null or a<=0)) or (p_entry->>'absence_scope'='full' and a is not null))) then raise exception 'Durata assenza non valida';end if;
 select version into v from public.test_daily_presence where worker_id=actor and day=dt;
 if v is distinct from p_expected_version then raise exception 'Dati cambiati: riapri la giornata o la settimana';end if;
 insert into public.test_daily_presence(worker_id,day,supplementary_minutes,cause,absence_scope,absence_minutes,version,updated_at)
 values(actor,dt,s,p_entry->>'cause',p_entry->>'absence_scope',a,coalesce(v,0)+1,clock_timestamp())
 on conflict(worker_id,day) do update set supplementary_minutes=excluded.supplementary_minutes,cause=excluded.cause,absence_scope=excluded.absence_scope,absence_minutes=excluded.absence_minutes,version=excluded.version,updated_at=excluded.updated_at returning * into r;
 update public.test_daily_notices set read_at=now() where worker_id=actor and day=dt and kind='day' and read_at is null;
 return to_jsonb(r);
end $$;
revoke all on function public.save_test_daily_presence(jsonb,integer) from public,anon;
grant execute on function public.save_test_daily_presence(jsonb,integer) to authenticated;
create function public.save_test_presence_week(p_week_ending date,p_entries jsonb,p_versions jsonb,p_document uuid default null,p_week_version integer default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.test_presence_actor();d public.documents;start_day date;finish_day date;expected integer;e jsonb;dt date;seen date[]:='{}';current_version integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('test-presence:'||actor::text,0));
 if p_week_ending is null or extract(isodow from p_week_ending)<>5 then raise exception 'Venerdì non valido';end if;
 start_day:=p_week_ending-4;finish_day:=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date);
 if p_document is not null then
 select * into d from public.documents where id=p_document for share;
 if not found or d.worker_id<>actor or d.category<>'presenze' or d.stage not in ('weekly','replacement') or d.review_status='rejected' or d.week_ending<>p_week_ending or exists(select 1 from public.documents where replaces=d.id) then raise exception 'Foglio non valido';end if;
 start_day:=greatest(start_day,(d.month||'-01')::date);finish_day:=least(finish_day,(date_trunc('month',(d.month||'-01')::date)+interval '1 month -1 day')::date);
 select version into current_version from public.test_worker_week_changes where document_id=p_document;
 if current_version is distinct from p_week_version then raise exception 'Dati cambiati: riapri la settimana';end if;
 end if;
 expected:=greatest(0,finish_day-start_day+1);
 if p_entries is null or p_versions is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<>expected or expected=0 or jsonb_typeof(p_versions)<>'object' then raise exception 'Controlla tutti i giorni trascorsi';end if;
 for e in select value from jsonb_array_elements(p_entries) loop
 dt:=(e->>'day')::date;if dt is null or dt<start_day or dt>finish_day or dt=any(seen) then raise exception 'Giorno duplicato o fuori settimana';end if;seen:=array_append(seen,dt);
 if not(p_versions ? (e->>'day')) then raise exception 'Versione giorno mancante';end if;
 perform public.save_test_daily_presence(e,(p_versions->>(e->>'day'))::integer);
 end loop;
 if p_document is not null then
 if current_version is null then insert into public.test_worker_week_changes(document_id,worker_id,week_ending,days,confirmed) values(p_document,actor,p_week_ending,p_entries,true);
 else update public.test_worker_week_changes set days=p_entries,confirmed=true,version=current_version where document_id=p_document;end if;
 else
 insert into public.test_presence_week_confirmations(worker_id,week_ending,confirmed_at) values(actor,p_week_ending,clock_timestamp()) on conflict(worker_id,week_ending) do update set confirmed_at=excluded.confirmed_at;
 end if;
 update public.test_daily_notices set read_at=now() where worker_id=actor and kind='week' and day=p_week_ending and read_at is null;
end $$;
revoke all on function public.save_test_presence_week(date,jsonb,jsonb,uuid,integer) from public,anon;
grant execute on function public.save_test_presence_week(date,jsonb,jsonb,uuid,integer) to authenticated;
create function public.save_test_daily_preferences(p_enabled boolean,p_time time,p_weekdays integer[]) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.test_presence_actor();begin
 if p_enabled is null or p_time is null then raise exception 'Scegli un orario durante il tuo turno';end if;
 insert into public.test_daily_preferences(worker_id,enabled,reminder_time,weekdays) values(actor,p_enabled,p_time,p_weekdays) on conflict(worker_id) do update set enabled=excluded.enabled,reminder_time=excluded.reminder_time,weekdays=excluded.weekdays,updated_at=now();
end $$;
revoke all on function public.save_test_daily_preferences(boolean,time,integer[]) from public,anon;
grant execute on function public.save_test_daily_preferences(boolean,time,integer[]) to authenticated;
create function public.read_test_daily_notice(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.test_presence_actor();begin update public.test_daily_notices set read_at=now() where id=p_id and worker_id=actor and read_at is null;end $$;
revoke all on function public.read_test_daily_notice(uuid) from public,anon;
grant execute on function public.read_test_daily_notice(uuid) to authenticated;
-- Test participants must opt in. Contract schedules, when confirmed, also exclude rest days.
create function private.test_collect_daily_presence(at_time timestamptz default now()) returns void language plpgsql set search_path='' as $$
declare ld date:=(at_time at time zone 'Europe/Rome')::date;lt time:=(at_time at time zone 'Europe/Rome')::time;dow integer:=extract(isodow from (at_time at time zone 'Europe/Rome'))::integer;
begin
 insert into public.test_daily_notices(worker_id,day,kind,created_at)
 select pref.worker_id,ld,case when dow=5 then 'week' else 'day' end,at_time
 from public.test_daily_preferences pref join public.profiles p on p.id=pref.worker_id
 left join lateral (select schedule from public.hour_budget_registry reg cross join lateral jsonb_array_elements(reg.schedules) schedule where reg.account_id=p.id and coalesce(schedule->>'valid_from',schedule->>'from')<=ld::text order by coalesce(schedule->>'valid_from',schedule->>'from') desc limit 1) sc on true
 where pref.enabled and p.active and p.role='worker' and dow=any(pref.weekdays)
 and (at_time at time zone 'Europe/Rome')>=ld+pref.reminder_time and (at_time at time zone 'Europe/Rome')<ld+pref.reminder_time+interval '30 minutes'
 and (sc.schedule is null or (sc.schedule->>'confirmed')::boolean is distinct from true or coalesce((sc.schedule->'hours'->>(dow-1))::numeric,0)>0)
 and ((dow<>5 and not exists(select 1 from public.test_daily_presence dp where dp.worker_id=p.id and dp.day=ld)) or
 (dow=5 and not exists(select 1 from public.test_presence_week_confirmations wc where wc.worker_id=p.id and wc.week_ending=ld and wc.confirmed_at>=coalesce((select max(updated_at) from public.test_daily_presence dp where dp.worker_id=p.id and dp.day between ld-4 and ld),'-infinity'::timestamptz))))
 on conflict(worker_id,day,kind) do nothing;
 insert into public.test_daily_deliveries(notice_id,subscription_id)
 select n.id,s.id from public.test_daily_notices n join public.test_daily_preferences pref on pref.worker_id=n.worker_id and pref.enabled join public.test_push_subscriptions s on s.user_id=n.worker_id and s.app_scope='test' and s.push_keys is not null
 where n.day=ld and n.created_at>=at_time-interval '30 minutes' and n.read_at is null on conflict do nothing;
 update public.test_daily_deliveries set state='failed' where state='sending' and attempted_at<now()-interval '10 minutes';
 update public.test_daily_deliveries set state='skipped' where state='pending' and notice_id in (select id from public.test_daily_notices where day<ld or read_at is not null);
end $$;
revoke all on function private.test_collect_daily_presence(timestamptz) from public,anon,authenticated;
create function public.claim_test_daily_presence() returns setof public.test_daily_deliveries language sql set search_path='' as $$
 update public.test_daily_deliveries set state='sending',attempts=attempts+1,attempted_at=now() where (notice_id,subscription_id) in (select notice_id,subscription_id from public.test_daily_deliveries where state='pending' and attempts<3 and (attempted_at is null or attempted_at<now()-interval '5 minutes') order by notice_id for update skip locked limit 20) returning *;
$$;
revoke all on function public.claim_test_daily_presence() from public,anon,authenticated;
grant execute on function public.claim_test_daily_presence() to service_role;
create function private.test_daily_presence_tick() returns void language plpgsql set search_path='' as $$
declare secret text;begin
 perform private.test_collect_daily_presence();
 if exists(select 1 from public.test_daily_deliveries where state='pending' and attempts<3) then
 select job_token into secret from public.test_push_config where id and public_key is not null;
 if secret is not null then perform net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/test-daily-presence-push',headers:=jsonb_build_object('Content-Type','application/json','x-push-job',secret),body:='{}'::jsonb,timeout_milliseconds:=10000);end if;
 end if;
end $$;
revoke all on function private.test_daily_presence_tick() from public,anon,authenticated;
-- Cron is enabled only after the dedicated sender has been deployed.
commit;
