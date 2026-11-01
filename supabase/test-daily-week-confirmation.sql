CREATE OR REPLACE FUNCTION private.save_test_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid DEFAULT NULL::uuid, p_week_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 end if;
 if (select count(*) from public.test_daily_presence where worker_id=actor and day between p_week_ending-4 and least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date))=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date)-(p_week_ending-4)+1 then
 insert into public.test_presence_week_confirmations(worker_id,week_ending,confirmed_at) values(actor,p_week_ending,clock_timestamp()) on conflict(worker_id,week_ending) do update set confirmed_at=excluded.confirmed_at;
 end if;
 update public.test_daily_notices set read_at=now() where worker_id=actor and kind='week' and day=p_week_ending and read_at is null;
end $function$

