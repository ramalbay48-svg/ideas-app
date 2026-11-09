-- IDEAS APP feature upgrade: tipster profiles, admin controls, banners and publishing
begin;

alter table public.announcements add column if not exists image_url text;
alter table public.announcements add column if not exists updated_at timestamptz not null default now();


-- Let tipsters edit their own profile fields without allowing self-promotion to admin.
create or replace function public.current_ideas_role()
returns text language sql stable security definer set search_path=public
as $ select role from public.profiles where id=auth.uid() $;
revoke all on function public.current_ideas_role() from public, anon;
grant execute on function public.current_ideas_role() to authenticated;

drop policy if exists "ideas_profiles_update_own_or_admin" on public.profiles;
create policy "ideas_profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id=auth.uid() or public.is_ideas_admin())
with check ((id=auth.uid() and role=public.current_ideas_role()) or public.is_ideas_admin());

-- Approved tipsters may edit only their own public tipster profile.
drop policy if exists "ideas_tipsters_owner_update_profile" on public.tipsters;
create policy "ideas_tipsters_owner_update_profile" on public.tipsters
for update to authenticated
using (user_id = auth.uid() and status = 'approved')
with check (user_id = auth.uid() and status = 'approved');

-- Admins can create, edit and remove banner announcements.
grant insert, update, delete on public.announcements to authenticated;

-- Public profile pictures and banner images are non-sensitive media.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ideas-public-media','ideas-public-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "ideas_public_media_upload_owner_admin" on storage.objects;
create policy "ideas_public_media_upload_owner_admin" on storage.objects
for insert to authenticated with check (
  bucket_id='ideas-public-media'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or (storage.foldername(name))[1]='banners' and public.is_ideas_admin()
  )
);

drop policy if exists "ideas_public_media_update_owner_admin" on storage.objects;
create policy "ideas_public_media_update_owner_admin" on storage.objects
for update to authenticated using (
  bucket_id='ideas-public-media'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or (storage.foldername(name))[1]='banners' and public.is_ideas_admin()
  )
) with check (
  bucket_id='ideas-public-media'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or (storage.foldername(name))[1]='banners' and public.is_ideas_admin()
  )
);

drop policy if exists "ideas_public_media_delete_owner_admin" on storage.objects;
create policy "ideas_public_media_delete_owner_admin" on storage.objects
for delete to authenticated using (
  bucket_id='ideas-public-media'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or (storage.foldername(name))[1]='banners' and public.is_ideas_admin()
  )
);

create or replace function public.admin_update_tipster_profile(
  p_tipster_id uuid, p_username text, p_bio text, p_display_name text
) returns void
language plpgsql security definer set search_path=public
as $$
declare v_user_id uuid;
begin
  if not public.is_ideas_admin() then raise exception 'Administrator access required'; end if;
  if p_username !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Username must be 3–24 letters, numbers or underscores'; end if;
  select user_id into v_user_id from public.tipsters where id=p_tipster_id;
  if v_user_id is null then raise exception 'Tipster not found'; end if;
  update public.tipsters set username=p_username,bio=left(coalesce(p_bio,''),240),updated_at=now() where id=p_tipster_id;
  update public.profiles set display_name=left(coalesce(p_display_name,''),60),updated_at=now() where id=v_user_id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(auth.uid(),'tipster_profile_updated','tipster',p_tipster_id,jsonb_build_object('username',p_username));
end $$;

create or replace function public.admin_remove_tipster(p_tipster_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_user_id uuid; v_username text;
begin
  if not public.is_ideas_admin() then raise exception 'Administrator access required'; end if;
  select user_id,username into v_user_id,v_username from public.tipsters where id=p_tipster_id;
  if v_user_id is null then raise exception 'Tipster not found'; end if;
  -- Preserve purchase and result history: remove public access instead of destroying financial records.
  update public.tipsters set status='suspended',updated_at=now() where id=p_tipster_id;
  update public.profiles set role='customer',updated_at=now() where id=v_user_id and role='tipster';
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(auth.uid(),'tipster_removed','tipster',p_tipster_id,jsonb_build_object('username',v_username));
end $$;

revoke all on function public.admin_update_tipster_profile(uuid,text,text,text) from public, anon;
grant execute on function public.admin_update_tipster_profile(uuid,text,text,text) to authenticated;
revoke all on function public.admin_remove_tipster(uuid) from public, anon;
grant execute on function public.admin_remove_tipster(uuid) to authenticated;

commit;
