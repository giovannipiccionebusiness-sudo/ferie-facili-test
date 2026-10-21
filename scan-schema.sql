-- TEST-only derivative images. Originals and Drive queue remain unchanged.
create table public.test_document_scans (
 document_id uuid primary key references public.documents(id) on delete cascade,
 source_path text not null,
 file_path text not null,
 cropped boolean not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 constraint test_scan_path check (file_path=document_id::text||'/auto-v1.jpg')
);
alter table public.test_document_scans enable row level security;
revoke all on public.test_document_scans from anon;
grant select,insert,update on public.test_document_scans to authenticated;
create policy test_scans_read on public.test_document_scans for select to authenticated using (private.is_admin());
create policy test_scans_insert on public.test_document_scans for insert to authenticated with check (private.is_admin() and created_by=auth.uid() and exists(select 1 from public.documents d where d.id=document_id and d.file_path=source_path));
create policy test_scans_update on public.test_document_scans for update to authenticated using(private.is_admin()) with check(private.is_admin() and created_by=auth.uid() and exists(select 1 from public.documents d where d.id=document_id and d.file_path=source_path));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('document-scans-test','document-scans-test',false,12582912,array['image/jpeg']);
create policy test_scan_image_read on storage.objects for select to authenticated using(bucket_id='document-scans-test' and private.is_admin());
create policy test_scan_image_insert on storage.objects for insert to authenticated with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name=d.id::text||'/auto-v1.jpg'));
create policy test_scan_image_update on storage.objects for update to authenticated using(bucket_id='document-scans-test' and private.is_admin()) with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name=d.id::text||'/auto-v1.jpg'));
