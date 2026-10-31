begin;
create table public.test_worker_week_changes(
 document_id uuid primary key references public.documents(id) on delete cascade,
 worker_id uuid not null references public.profiles(id),week_ending date not null,
 days jsonb not null,confirmed boolean not null default true check(confirmed),
 version integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.test_worker_week_changes enable row level security;
revoke all on public.test_worker_week_changes from public,anon,authenticated;
grant select,insert,update on public.test_worker_week_changes to authenticated;
grant all on public.test_worker_week_changes to service_role;
create policy test_week_read on public.test_worker_week_changes for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or p.id=worker_id)));
create policy test_week_insert on public.test_worker_week_changes for insert to authenticated with check(worker_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='worker') and exists(select 1 from public.documents d where d.id=document_id and d.worker_id=(select auth.uid()) and d.category='presenze' and d.stage in ('weekly','replacement') and d.review_status<>'rejected'));
create policy test_week_update on public.test_worker_week_changes for update to authenticated using(worker_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='worker')) with check(worker_id=(select auth.uid()));
create function private.validate_test_worker_week() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.documents;r jsonb;dt date;start_day date;finish_day date;seen date[]:='{}';s integer;a integer;expected integer;
begin
 if auth.uid() is null or new.worker_id<>auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;
 if TG_OP='UPDATE' and (new.document_id<>old.document_id or new.worker_id<>old.worker_id or new.week_ending<>old.week_ending or new.version<>old.version) then raise exception 'Dati cambiati: riapri la dichiarazione';end if;
 select * into d from public.documents where id=new.document_id for share;
 if not found or d.worker_id is distinct from new.worker_id or d.category<>'presenze' or d.stage not in ('weekly','replacement') or d.review_status='rejected' or d.week_ending<>new.week_ending or exists(select 1 from public.documents where replaces=d.id) then raise exception 'Foglio non valido o già sostituito';end if;
 start_day:=greatest(d.week_ending-4,(d.month||'-01')::date);finish_day:=least(d.week_ending+2,(date_trunc('month',(d.month||'-01')::date)+interval '1 month -1 day')::date,(now() at time zone 'Europe/Rome')::date);expected:=greatest(0,finish_day-start_day+1);
 if jsonb_typeof(new.days)<>'array' or jsonb_array_length(new.days)<>expected or expected=0 then raise exception 'Giorni della settimana non validi';end if;
 for r in select value from jsonb_array_elements(new.days) loop
  if jsonb_typeof(r)<>'object' or not(r ?& array['day','supplementary_minutes','cause','absence_scope','absence_minutes']) then raise exception 'Riga incompleta';end if;
  if jsonb_typeof(r->'cause')<>'string' or jsonb_typeof(r->'day')<>'string' or (r->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Giorno o causale non validi';end if;
  dt:=(r->>'day')::date;if dt<start_day or dt>finish_day or dt=any(seen) then raise exception 'Giorno fuori settimana o duplicato';end if;seen:=array_append(seen,dt);
  if jsonb_typeof(r->'supplementary_minutes')<>'number' or (r->>'supplementary_minutes')!~'^\d+$' then raise exception 'Supplementare non valido';end if;s:=(r->>'supplementary_minutes')::integer;
  if s<0 or s>1440 or r->>'cause' not in ('','F','M','L104','PHR','congedo parentale') then raise exception 'Ore o causale non valide';end if;
  if r->>'cause'='' then if r->>'absence_scope' is not null or r->>'absence_minutes' is not null then raise exception 'Assenza senza causale';end if;a:=0;
  elsif r->>'absence_scope'='full' then if r->>'absence_minutes' is not null then raise exception 'Giornata intera non richiede ore';end if;a:=0;
  elsif r->>'absence_scope'='partial' then if jsonb_typeof(r->'absence_minutes')<>'number' or (r->>'absence_minutes')!~'^\d+$' then raise exception 'Durata assenza non valida';end if;a:=(r->>'absence_minutes')::integer;if a<=0 then raise exception 'Indica le ore di assenza';end if;
  else raise exception 'Tipo assenza non valido';end if;
  if s+a>1440 then raise exception 'Totale oltre 24 ore';end if;
 end loop;
 if not new.confirmed then raise exception 'Conferma la dichiarazione';end if;
 new.version:=case when TG_OP='INSERT' then 1 else old.version+1 end;new.updated_at:=now();return new;
end;$$;
revoke all on function private.validate_test_worker_week() from public,anon,authenticated;
create trigger validate_test_worker_week before insert or update on public.test_worker_week_changes for each row execute function private.validate_test_worker_week();
commit;
