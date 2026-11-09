-- IDEAS APP private betslip image storage
-- Run once in Supabase SQL Editor. The bucket remains private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ideas-betslips', 'ideas-betslips', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "ideas_slip_storage_tipster_upload" on storage.objects;
create policy "ideas_slip_storage_tipster_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ideas-betslips'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.betslips b
    join public.tipsters t on t.id = b.tipster_id
    where b.id::text = (storage.foldername(name))[2]
      and t.user_id = auth.uid()
      and t.status = 'approved'
      and b.status = 'draft'
  )
);

drop policy if exists "ideas_slip_storage_read_owner_paid_admin" on storage.objects;
create policy "ideas_slip_storage_read_owner_paid_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'ideas-betslips'
  and (
    public.is_ideas_admin()
    or exists (
      select 1 from public.betslips b
      join public.tipsters t on t.id = b.tipster_id
      where b.id::text = (storage.foldername(name))[2]
        and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.slip_assets a
      join public.purchases p on p.slip_id = a.slip_id
      where a.storage_path = name
        and p.customer_id = auth.uid()
        and p.status = 'paid'
    )
  )
);

drop policy if exists "ideas_slip_storage_delete_owner_admin" on storage.objects;
create policy "ideas_slip_storage_delete_owner_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ideas-betslips'
  and (
    public.is_ideas_admin()
    or exists (
      select 1 from public.betslips b
      join public.tipsters t on t.id = b.tipster_id
      where b.id::text = (storage.foldername(name))[2]
        and t.user_id = auth.uid()
        and b.status = 'draft'
    )
  )
);
