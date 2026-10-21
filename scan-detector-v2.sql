-- TEST: version the cached output so existing uncropped scans are regenerated.
alter table public.test_document_scans add column if not exists algorithm_version integer not null default 1;
alter table public.test_document_scans drop constraint test_scan_path;
alter table public.test_document_scans add constraint test_scan_path check (file_path in (document_id::text||'/auto-v1.jpg',document_id::text||'/auto-v2.jpg'));
alter policy test_scan_image_insert on storage.objects with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in (d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg')));
alter policy test_scan_image_update on storage.objects using(bucket_id='document-scans-test' and private.is_admin()) with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in (d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg')));
