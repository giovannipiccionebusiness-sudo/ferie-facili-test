begin;
create temp table shift_test_actors as select id,role,row_number() over(partition by role order by created_at) n from public.profiles where active;
select set_config('request.jwt.claim.sub',(select id::text from shift_test_actors where role='admin' and n=1),true);
set local role authenticated;
DO $$declare worker uuid;v jsonb;begin
 select id into worker from public.profiles where active and role='worker' order by created_at limit 1;
 v:='[[{"start":"08:00","end":"12:00"},{"start":"14:00","end":"17:00"}],[{"start":"13:00","end":"17:00"}],[{"start":"18:00","end":"22:00"}],[{"start":"22:00","end":"02:00"}],[{"start":"08:00","end":"14:00"}],[],[]]';
 perform public.save_test_worker_shifts(worker,'2020-11-01',v,true,null);
 if (select version from public.test_worker_shifts where worker_id=worker and valid_from='2020-11-01')<>1 then raise exception 'Admin save failed';end if;
 begin perform public.save_test_worker_shifts(worker,'2020-11-01',v,true,null);raise exception 'TEST stale save accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_worker_shifts(worker,'2020-11-01',jsonb_set(v,'{0}','[{"start":"08:00","end":"12:00"},{"start":"11:00","end":"17:00"}]'),true,1);raise exception 'TEST overlap accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_worker_shifts(worker,'2020-11-01',jsonb_set(v,'{0}','[{"start":"17:00","end":"17:00"}]'),true,1);raise exception 'TEST zero duration accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_worker_shifts(worker,'2020-11-01',jsonb_set(v,'{0}','[{"start":"08:00","end":"08:15"}]'),true,1);raise exception 'TEST short shift accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 -- Future schedule must not change an earlier week's timing.
 perform public.save_test_worker_shifts(worker,'2020-11-09',jsonb_set(v,'{0}','[{"start":"10:00","end":"18:00"}]'),true,null);
end $$;
reset role;
DO $$declare worker uuid:=(select id from shift_test_actors where role='worker' and n=1);r timestamptz;e timestamptz;begin
 select remind_at,end_at into r,e from private.test_shift_window(worker,'2020-11-02');if r<>'2020-11-02T15:30Z'::timestamptz or e-r<>interval '30 minutes' then raise exception 'Wrong final-slot timing';end if;
 select remind_at into r from private.test_shift_window(worker,'2020-11-09');if r<>'2020-11-09T16:30Z'::timestamptz then raise exception 'Future effective schedule not applied';end if;
 perform private.test_collect_daily_presence('2020-11-02T15:29Z');if exists(select 1 from public.test_daily_notices where worker_id=worker and day='2020-11-02') then raise exception 'Too early';end if;
 perform private.test_collect_daily_presence('2020-11-02T15:30Z');perform private.test_collect_daily_presence('2020-11-02T15:31Z');if (select count(*) from public.test_daily_notices where worker_id=worker and day='2020-11-02')<>1 then raise exception 'Missing or duplicate notice';end if;
 perform private.test_collect_daily_presence('2020-11-03T17:00Z');if exists(select 1 from public.test_daily_notices where worker_id=worker and day='2020-11-03') then raise exception 'Notice after end';end if;
 perform private.test_collect_daily_presence('2020-11-07T12:00Z');if exists(select 1 from public.test_daily_notices where worker_id=worker and day='2020-11-07') then raise exception 'Rest day reminded';end if;
 perform private.test_collect_daily_presence('2020-11-06T12:30Z');if not exists(select 1 from public.test_daily_notices where worker_id=worker and day='2020-11-06' and kind='week') then raise exception 'Friday weekly notice missing';end if;
 -- Thursday 22–02 ends Friday; reminder belongs to Thursday.
 select remind_at into r from private.test_shift_window(worker,'2020-11-05');if r<>'2020-11-06T00:30Z'::timestamptz then raise exception 'Night shift wrong';end if;
 perform private.test_collect_daily_presence('2020-11-06T00:30Z');if not exists(select 1 from public.test_daily_notices where worker_id=worker and day='2020-11-05' and kind='day') then raise exception 'Night reminder missing';end if;
 -- Summer clock and DST transitions: actual elapsed interval is always 30 minutes.
 select remind_at,end_at into r,e from private.test_shift_window(worker,'2026-07-06');if e-r<>interval '30 minutes' or extract(hour from r at time zone 'Europe/Rome')<>17 then raise exception 'Summer timezone wrong';end if;
 if exists(select 1 from public.test_daily_deliveries d join public.test_push_subscriptions s on s.id=d.subscription_id where s.app_scope is distinct from 'test') then raise exception 'Production endpoint included';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from shift_test_actors where role='worker' and n=1),true);
set local role authenticated;
DO $$declare worker uuid:=auth.uid();begin
 begin perform public.save_test_worker_shifts(worker,'2020-11-01','[[],[],[],[],[],[],[]]',false,1);raise exception 'TEST worker could change shifts';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_daily_preferences(true,'12:00',array[1]);raise exception 'TEST old worker preference setter active';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.test_worker_shifts where worker_id<>auth.uid()) then raise exception 'Worker sees other shifts';end if;
end $$;
reset role;
select 'PASS: admin-only shifts, revoked worker settings, versions, overlap/zero/short shifts, effective dates, final activity minus 30 minutes, deduplication, rest days, Friday, overnight shift and summer timezone' as checks;
rollback;
