begin;
-- No test declarations or notices survive this transaction; no dispatcher is called.
create temp table test_presence_actors as select id,row_number() over(order by created_at) n from public.profiles where active and role='worker';
select set_config('request.jwt.claim.sub',(select id::text from test_presence_actors where n=1),true);
set local role authenticated;
DO $$declare e jsonb:='{"day":"2020-11-02","supplementary_minutes":90,"cause":"","absence_scope":null,"absence_minutes":null}';r jsonb;begin
 r:=public.save_test_daily_presence(e,null);if (r->>'supplementary_minutes')::int<>90 or (r->>'version')::int<>1 then raise exception 'Initial save failed';end if;
 r:=public.save_test_daily_presence(jsonb_set(e,'{supplementary_minutes}','100'),1);if (r->>'version')::int<>2 then raise exception 'Edit failed';end if;
 begin perform public.save_test_daily_presence(e,1);raise exception 'TEST stale write accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_daily_presence(jsonb_set(e,'{day}',to_jsonb(((now() at time zone 'Europe/Rome')::date+1)::text)),null);raise exception 'TEST future accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_daily_presence(jsonb_set(e,'{supplementary_minutes}','1.5'),2);raise exception 'TEST fractional minutes accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_daily_presence(e||'{"cause":"F","absence_scope":"partial","absence_minutes":null}'::jsonb,2);raise exception 'TEST invalid absence accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin insert into public.test_daily_presence(worker_id,day) values(auth.uid(),'2020-11-10');raise exception 'TEST direct write accepted';exception when insufficient_privilege then null;end;
 perform public.save_test_daily_presence('{"day":"2020-11-03","supplementary_minutes":0,"cause":"PHR","absence_scope":"partial","absence_minutes":90}',null);
 perform public.save_test_daily_presence('{"day":"2020-11-04","supplementary_minutes":0,"cause":"F","absence_scope":"full","absence_minutes":null}',null);
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from test_presence_actors where n=2),true);
set local role authenticated;
DO $$begin if exists(select 1 from public.test_daily_presence where day between '2020-11-02' and '2020-11-04') then raise exception 'Other worker can read';end if;end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from test_presence_actors where n=1),true);
set local role authenticated;
DO $$declare entries jsonb;versions jsonb;begin
 select jsonb_agg(jsonb_build_object('day',d::date::text,'supplementary_minutes',coalesce(p.supplementary_minutes,0),'cause',coalesce(p.cause,''),'absence_scope',p.absence_scope,'absence_minutes',p.absence_minutes) order by d),jsonb_object_agg(d::date::text,p.version) into entries,versions from generate_series('2020-11-02'::date,'2020-11-08'::date,'1 day') d left join public.test_daily_presence p on p.worker_id=auth.uid() and p.day=d::date;
 perform public.save_test_presence_week('2020-11-06',entries,versions);
 if (select count(*) from public.test_daily_presence where day between '2020-11-02' and '2020-11-08')<>7 then raise exception 'Week did not reuse daily rows';end if;
 if (select supplementary_minutes from public.test_daily_presence where day='2020-11-02')<>100 then raise exception 'Supplementary overwritten';end if;
 if (select absence_minutes from public.test_daily_presence where day='2020-11-03')<>90 then raise exception 'Absence overwritten';end if;
 begin perform public.save_test_presence_week('2020-11-06',entries,versions);raise exception 'TEST stale weekly write accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.save_test_presence_week('2020-11-06',null,versions);raise exception 'TEST null week accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
end $$;
reset role;
select 'PASS: daily save/edit, stale writes, future days, fractional and absence validation, RLS, direct write denial and weekly reuse' as checks;
rollback;
