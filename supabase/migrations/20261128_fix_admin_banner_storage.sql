-- IDEAS APP: repair admin banner storage configuration.
-- Safe to run more than once in the IDEAS APP Supabase project.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ideas-public-media',
  'ideas-public-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "ideas_public_media_upload_owner_admin" on storage.objects;
create policy "ideas_public_media_upload_owner_admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ideas-public-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'banners' and public.is_ideas_admin())
  )
);

drop policy if exists "ideas_public_media_update_owner_admin" on storage.objects;
create policy "ideas_public_media_update_owner_admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'ideas-public-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'banners' and public.is_ideas_admin())
  )
)
with check (
  bucket_id = 'ideas-public-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'banners' and public.is_ideas_admin())
  )
);

drop policy if exists "ideas_public_media_delete_owner_admin" on storage.objects;
create policy "ideas_public_media_delete_owner_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ideas-public-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'banners' and public.is_ideas_admin())
  )
);

commit;
