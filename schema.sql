create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
-- Eseguire nel SQL Editor di Supabase, su un progetto nuovo.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 site text check(site in ('N153','N148')),
 phone text,
 role text not null default 'worker' check(role in ('worker','admin')),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create function private.create_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end; $$;
create trigger create_profile_after_signup after insert on auth.users for each row execute procedure private.create_profile();
create function private.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true)
$$;
create function private.is_active() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active=true)
$$;
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 worker_id uuid not null references public.profiles(id),
 site text not null check(site in ('N153','N148')),
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 category text not null check(category in ('presenze','ferie','rol','legge104','malattia')),
 stage text not null check(stage in ('weekly','replacement','final','request')),
 week_ending date,
 replaces uuid references public.documents(id),
 file_path text not null unique,
 file_name text not null,
 note text not null default '',
 review_status text not null default 'pending' check(review_status in ('pending','verified','rejected')),
 review_reason text,
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 "authorization" text not null default 'not_applicable' check("authorization" in ('not_applicable','pending','approved','denied')),
 authorized_at timestamptz,
 created_at timestamptz not null default now(),
 constraint valid_document_type check ((category='presenze' and stage in ('weekly','replacement','final')) or (category<>'presenze' and stage='request')),
 constraint week_for_weekly check ((stage in ('weekly','replacement') and week_ending is not null) or (stage in ('final','request') and week_ending is null))
);
create unique index one_verified_final_per_month on public.documents(worker_id,month) where category='presenze' and stage='final' and review_status='verified';
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 worker_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('reminder','review','authorization','general')),
 message text not null,
 week_ending date,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create unique index unique_week_reminder on public.notifications(worker_id,week_ending) where kind='reminder';
create table public.audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id),
 action text not null,
 target_id uuid,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create function private.audit_document_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.audit_log(actor_id,action,target_id,details)
 values(auth.uid(),case when TG_OP='INSERT' then 'upload' else 'review' end,new.id,jsonb_build_object('status',new.review_status,'authorization',new."authorization",'stage',new.stage));
 return new;
end; $$;
create trigger audit_document after insert or update on public.documents for each row execute procedure private.audit_document_change();
create function public.mark_notification_read(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin update public.notifications set read_at=now() where id=p_id and worker_id=auth.uid(); end; $$;
revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy profile_admin_update on public.profiles for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy docs_read on public.documents for select to authenticated using(private.is_admin() or (worker_id=auth.uid() and private.is_active()));
create policy docs_insert on public.documents for insert to authenticated with check(worker_id=auth.uid() and private.is_active() and site=(select site from public.profiles where id=auth.uid()) and review_status='pending' and reviewed_by is null and reviewed_at is null and "authorization"=case when category in ('ferie','rol') then 'pending' else 'not_applicable' end);
create policy docs_admin_update on public.documents for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy notif_read on public.notifications for select to authenticated using(worker_id=auth.uid() or private.is_admin());
create policy notif_admin_insert on public.notifications for insert to authenticated with check(private.is_admin() and created_by=auth.uid());
create policy audit_read on public.audit_log for select to authenticated using(private.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('private-documents','private-documents',false,12582912,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=12582912,allowed_mime_types=excluded.allowed_mime_types;
create policy storage_worker_insert on storage.objects for insert to authenticated with check(bucket_id='private-documents' and private.is_active() and (storage.foldername(name))[1]=auth.uid()::text);
create policy storage_worker_read on storage.objects for select to authenticated using(bucket_id='private-documents' and (private.is_admin() or (private.is_active() and (storage.foldername(name))[1]=auth.uid()::text)));
-- Dopo la registrazione del tuo account, promuovilo UNA VOLTA nel SQL Editor:
-- update public.profiles set role='admin',active=true,full_name='Responsabile' where id=(select id from auth.users where email='TUA_EMAIL');
-- Abilita i lavoratori dal pannello amministratore, assegnando anche la sede.

-- One administrator, including inactive administrators.
create unique index only_one_administrator on public.profiles(role) where role='admin';
alter table public.profiles add constraint active_worker_has_site check(not active or role='admin' or site is not null);
alter table public.profiles add constraint reasonable_name check(length(full_name)<=150);
alter table public.documents add constraint bounded_note check(length(note)<=250);
alter table public.documents add constraint bounded_filename check(length(file_name)<=255);
create index documents_worker_month on public.documents(worker_id,month,created_at desc);
create index documents_replaces on public.documents(replaces);
create index notifications_worker_date on public.notifications(worker_id,created_at desc);
create index audit_actor_date on public.audit_log(actor_id,created_at desc);

create function private.validate_document() returns trigger language plpgsql security definer set search_path='' as $$
declare previous public.documents;
begin
 if TG_OP='UPDATE' then
  if (new.id,new.worker_id,new.site,new.month,new.category,new.stage,new.week_ending,new.replaces,new.file_path,new.file_name,new.note,new.created_at)
    is distinct from (old.id,old.worker_id,old.site,old.month,old.category,old.stage,old.week_ending,old.replaces,old.file_path,old.file_name,old.note,old.created_at)
    then raise exception 'Document identity and original content are immutable'; end if;
  if new.review_status is distinct from old.review_status then
   new.reviewed_by:=auth.uid(); new.reviewed_at:=now();
   if new.review_status='rejected' and nullif(trim(new.review_reason),'') is null then raise exception 'Rejection reason required'; end if;
   if new.review_status<>'verified' and old."authorization" in ('approved','denied') then raise exception 'Authorized document cannot be unverified'; end if;
  end if;
  if new."authorization" is distinct from old."authorization" then
   if new.category not in ('ferie','rol') or new.review_status<>'verified' or new."authorization" not in ('approved','denied') then raise exception 'Authorization requires a verified request'; end if;
   new.authorized_at:=now();
  end if;
 else
  if new.file_path !~ ('^'||new.worker_id::text||'/'||new.month||'/'||new.id::text||'\.(pdf|jpeg|png|webp)$') then raise exception 'Invalid file path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='private-documents' and name=new.file_path) then raise exception 'Upload file first'; end if;
  new.created_at:=now(); new.authorized_at:=null; new.review_reason:=null;
  if new.week_ending is not null and (extract(isodow from new.week_ending)<>5 or to_char(new.week_ending,'YYYY-MM')<>new.month) then raise exception 'Select a Friday in the selected month'; end if;
  if new.stage='replacement' then
   select * into previous from public.documents where id=new.replaces for update;
   if not found or previous.worker_id<>new.worker_id or previous.month<>new.month or previous.week_ending<>new.week_ending or previous.stage not in ('weekly','replacement') or exists(select 1 from public.documents where replaces=previous.id) then raise exception 'Invalid replacement target'; end if;
  elsif new.replaces is not null then raise exception 'Only replacements may link previous files'; end if;
 end if;
 return new;
end $$;
create trigger validate_document before insert or update on public.documents for each row execute function private.validate_document();

create function private.audit_profile_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.active,new.site,new.role,new.phone,new.full_name) is distinct from (old.active,old.site,old.role,old.phone,old.full_name) then
 insert into public.audit_log(actor_id,action,target_id,details) values(auth.uid(),'profile_update',new.id,jsonb_build_object('active',new.active,'site',new.site,'role',new.role));
 end if;
 return new;
end $$;
create trigger audit_profile after update on public.profiles for each row execute function private.audit_profile_change();

-- Failed database inserts may remove their own unregistered upload, never archived files.
create policy storage_orphan_cleanup on storage.objects for delete to authenticated using(
 bucket_id='private-documents' and private.is_active() and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.documents where file_path=name)
);
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_admin(),private.is_active() to authenticated;
revoke all on public.profiles,public.documents,public.notifications,public.audit_log from anon;
grant select,update on public.profiles to authenticated;
grant select,insert,update on public.documents to authenticated;
grant select,insert on public.notifications to authenticated;
grant select on public.audit_log to authenticated;

alter function public.mark_notification_read(uuid) security invoker;
alter function public.mark_notification_read(uuid) set search_path='';
create or replace function public.mark_notification_read(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin update public.notifications set read_at=now() where id=p_id and worker_id=auth.uid(); end $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notifications_mark_read on public.notifications for update to authenticated using(worker_id=auth.uid()) with check(worker_id=auth.uid());
