alter table public.test_document_scans drop constraint test_scan_path;
alter table public.test_document_scans add constraint test_scan_path check(file_path in(document_id::text||'/auto-v1.jpg',document_id::text||'/auto-v2.jpg',document_id::text||'/auto-v2.pdf',document_id::text||'/auto-v3.jpg',document_id::text||'/auto-v3.pdf'));
alter policy test_scan_image_insert on storage.objects with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in(d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg',d.id::text||'/auto-v2.pdf',d.id::text||'/auto-v3.jpg',d.id::text||'/auto-v3.pdf')));
alter policy test_scan_image_update on storage.objects using(bucket_id='document-scans-test' and private.is_admin()) with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in(d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg',d.id::text||'/auto-v2.pdf',d.id::text||'/auto-v3.jpg',d.id::text||'/auto-v3.pdf')));
create or replace function private.queue_test_monthly() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.documents d where d.id=new.document_id and d.category='presenze' and d.stage='final') then
  insert into public.test_monthly_closures(document_id) values(new.document_id) on conflict do nothing;
  if TG_OP='UPDATE' then
   if old.file_path is distinct from new.file_path or old.algorithm_version is distinct from new.algorithm_version then
    update public.test_monthly_closures set status='pending',next_attempt_at=now(),last_error=null,completed_at=null,pair_verified_at=null,scan_hash=null,lease_id=null where document_id=new.document_id;
   end if;
  end if;
 end if;return new;
end $$;
