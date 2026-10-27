begin;
create table public.rest_offers(
 id uuid primary key default gen_random_uuid(),scope text not null default 'test' check(scope='test'),
 person_key text not null references public.leave_people(person_key),worker_id uuid not null references public.profiles(id),
 start_day date not null,end_day date not null check(end_day>=start_day),presentation jsonb not null check(jsonb_typeof(presentation)='object' and octet_length(presentation::text)<10000),
 state text not null default 'offered' check(state in ('offered','interested','alternative','declined')),
 alternative_start date,alternative_end date,version integer not null default 1,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),responded_at timestamptz,
 unique(scope,worker_id,start_day,end_day),check((state='alternative' and alternative_start is not null and alternative_end is not null and alternative_end>=alternative_start) or (state<>'alternative' and alternative_start is null and alternative_end is null))
);
create table public.rest_offer_audit(id bigint generated always as identity primary key,offer_id uuid not null references public.rest_offers(id),actor uuid not null references public.profiles(id),event text not null,version integer not null,created_at timestamptz not null default now());
alter table public.rest_offers enable row level security;alter table public.rest_offer_audit enable row level security;
revoke all on public.rest_offers,public.rest_offer_audit from public,anon,authenticated;
grant select,insert,update on public.rest_offers to service_role;grant select,insert on public.rest_offer_audit to service_role;grant usage,select on sequence public.rest_offer_audit_id_seq to service_role;
create function public.rest_send_offer(actor uuid,person text,recipient uuid,first_day date,last_day date,card jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.rest_offers;
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and active) then raise exception 'Non autorizzato' using errcode='42501';end if;
 if not exists(select 1 from public.leave_people p join public.profiles w on w.id=p.account_id where p.person_key=person and w.id=recipient and w.role='worker' and w.active) then raise exception 'Destinatario non abilitato';end if;
 if first_day is null or last_day is null or first_day<=(now() at time zone 'Europe/Rome')::date or last_day<first_day then raise exception 'Date non valide';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rest-offer:'||recipient::text||first_day::text||last_day::text,0));
 select * into result from public.rest_offers where scope='test' and worker_id=recipient and start_day=first_day and end_day=last_day;
 if found then if result.person_key<>person then raise exception 'Associazione cambiata: verifica la proposta precedente';end if;return to_jsonb(result);end if;
 insert into public.rest_offers(person_key,worker_id,start_day,end_day,presentation,created_by) values(person,recipient,first_day,last_day,card,actor) returning * into result;
 insert into public.rest_offer_audit(offer_id,actor,event,version) values(result.id,actor,'offered',1);
 return to_jsonb(result);
end $$;
create function public.rest_reply_offer(actor uuid,offer_id uuid,expected_version integer,answer text,first_day date default null,last_day date default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.rest_offers;
begin
 if not exists(select 1 from public.profiles where id=actor and role='worker' and active) then raise exception 'Non autorizzato' using errcode='42501';end if;
 select * into result from public.rest_offers o where o.id=offer_id and o.scope='test' and o.worker_id=actor for update;
 if not found or not exists(select 1 from public.leave_people p where p.person_key=result.person_key and p.account_id=actor) then raise exception 'Proposta non disponibile' using errcode='42501';end if;
 if expected_version is null or expected_version<>result.version then raise exception 'Versione superata' using errcode='40001';end if;
 if result.start_day<=(now() at time zone 'Europe/Rome')::date then raise exception 'Proposta scaduta';end if;
 if answer is null or answer not in ('interested','alternative','declined') then raise exception 'Preferenza non valida';end if;
 if answer='alternative' and (first_day is null or last_day is null or first_day<=(now() at time zone 'Europe/Rome')::date or last_day<first_day or last_day-first_day>92) then raise exception 'Date alternative non valide';end if;
 update public.rest_offers o set state=answer,alternative_start=case when answer='alternative' then first_day end,alternative_end=case when answer='alternative' then last_day end,version=o.version+1,responded_at=now() where o.id=result.id returning * into result;
 insert into public.rest_offer_audit(offer_id,actor,event,version) values(result.id,actor,answer,result.version);
 return to_jsonb(result);
end $$;
revoke all on function public.rest_send_offer(uuid,text,uuid,date,date,jsonb),public.rest_reply_offer(uuid,uuid,integer,text,date,date) from public,anon,authenticated;
grant execute on function public.rest_send_offer(uuid,text,uuid,date,date,jsonb),public.rest_reply_offer(uuid,uuid,integer,text,date,date) to service_role;
commit;
