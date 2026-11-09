-- Expose only non-sensitive profile fields for approved tipsters.
-- The base profiles table remains private to its owner and administrators.
create or replace view public.public_tipster_profiles
with (security_barrier = true)
as
select t.user_id, p.display_name, p.avatar_path
from public.tipsters t
join public.profiles p on p.id = t.user_id
where t.status = 'approved';

grant select on public.public_tipster_profiles to anon, authenticated;
