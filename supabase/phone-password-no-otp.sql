-- IDEAS APP: store the entered phone number in the profile at signup.
-- Run this in the dedicated IDEAS APP Supabase project only.
-- This does NOT verify ownership of the phone number.
create or replace function public.create_ideas_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, phone, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    coalesce(new.raw_user_meta_data->>'display_name',''),
    'customer'
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, public.profiles.phone),
        display_name = coalesce(excluded.display_name, public.profiles.display_name);
  return new;
end;
$$;
