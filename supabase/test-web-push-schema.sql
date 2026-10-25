begin;
create table public.test_push_config (
 id boolean primary key default true check(id),
 public_key text,
 private_jwk jsonb,
 job_token text not null default (gen_random_uuid()::text||gen_random_uuid()::text)
);
insert into public.test_push_config(id) values(true);
create table public.test_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<4096),
 activation_seen boolean not null default false,
 created_at timestamptz not null default now(),
 last_test_at timestamptz
);
create index on public.test_push_subscriptions(user_id);
create table public.test_push_queue (
 id bigint generated always as identity primary key,
 subscription_id uuid not null references public.test_push_subscriptions(id) on delete cascade,
 kind text not null check(kind in ('activation','weekly','monthly','test')),
 event_key text not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),
 attempts int not null default 0,
 created_at timestamptz not null default now(),
 attempted_at timestamptz,
 unique(subscription_id,event_key)
);
alter table public.test_push_config enable row level security;
alter table public.test_push_subscriptions enable row level security;
alter table public.test_push_queue enable row level security;
revoke all on public.test_push_config,public.test_push_subscriptions,public.test_push_queue from public,anon,authenticated;
grant all on public.test_push_config,public.test_push_subscriptions,public.test_push_queue to service_role;
grant usage,select on sequence public.test_push_queue_id_seq to service_role;

create function private.test_push_tick(at_time timestamptz default now()) returns void language plpgsql security invoker set search_path='' as $$
declare local_now timestamp := at_time at time zone 'Europe/Rome'; local_day date:=local_now::date; month_key text:=to_char(local_now,'YYYY-MM'); job_secret text;
begin
 insert into public.test_push_queue(subscription_id,kind,event_key)
 select s.id,'activation','activation:'||s.created_at::text from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id where not s.activation_seen and p.active and p.role='worker' on conflict do nothing;
 update public.test_push_subscriptions s set activation_seen=true from public.profiles p where p.id=s.user_id and p.active and not s.activation_seen;
 if extract(isodow from local_day)=5 and local_now::time between time '17:00' and time '20:00' then
  insert into public.test_push_queue(subscription_id,kind,event_key)
  select s.id,'weekly','weekly:'||local_day::text from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
  where p.active and p.role='worker' and not exists(select 1 from public.documents d where d.worker_id=p.id and d.category='presenze' and d.month=month_key and d.review_status<>'rejected' and ((d.stage in ('weekly','replacement') and d.week_ending=local_day) or d.stage='final')) on conflict do nothing;
 end if;
 if local_day=(date_trunc('month',local_day)+interval '1 month - 1 day')::date and local_now::time between time '18:00' and time '20:00' then
  insert into public.test_push_queue(subscription_id,kind,event_key)
  select s.id,'monthly','monthly:'||month_key from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
  where p.active and p.role='worker' and not exists(select 1 from public.documents d where d.worker_id=p.id and d.month=month_key and d.category='presenze' and d.stage='final' and d.review_status<>'rejected') on conflict do nothing;
 end if;
 update public.test_push_queue set state='pending' where state='sending' and attempted_at<now()-interval '10 minutes' and attempts<3;
 update public.test_push_queue set state='failed' where state='sending' and attempted_at<now()-interval '10 minutes' and attempts>=3;
 update public.test_push_queue set state='skipped' where state='pending' and created_at<now()-interval '1 day';
 delete from public.test_push_queue where created_at<now()-interval '45 days';
 if exists(select 1 from public.test_push_queue where state='pending' and attempts<3) then
  select job_token into job_secret from public.test_push_config where id and public_key is not null;
  if job_secret is not null then perform net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/test-web-push',headers:=jsonb_build_object('Content-Type','application/json','x-push-job',job_secret),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=10000); end if;
 end if;
end $$;
revoke all on function private.test_push_tick(timestamptz) from public,anon,authenticated;

create function public.test_claim_push() returns setof public.test_push_queue language sql security invoker set search_path='' as $$
 update public.test_push_queue set state='sending',attempts=attempts+1,attempted_at=now()
 where id in (select id from public.test_push_queue where state='pending' and attempts<3 and (attempted_at is null or attempted_at<now()-interval '5 minutes') order by id for update skip locked limit 20) returning *;
$$;
revoke all on function public.test_claim_push() from public,anon,authenticated;
grant execute on function public.test_claim_push() to service_role;
select cron.schedule('lavoro-facile-test-push','* * * * *','select private.test_push_tick();');
commit;
