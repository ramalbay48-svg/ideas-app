-- IDEAS APP: server-verified tipster review and audit trail
-- Run this in the IDEAS APP Supabase SQL Editor (project hclgguciyhdqaqsvuddp).
begin;

-- Remove direct browser-side status changes. Reviews must use the RPC below.
revoke update on table public.tipsters from anon, authenticated;

create or replace function public.review_tipster_application(
  p_tipster_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipster public.tipsters%rowtype;
begin
  if auth.uid() is null or not public.is_ideas_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  select * into v_tipster
  from public.tipsters
  where id = p_tipster_id
  for update;

  if not found then
    raise exception 'Tipster application not found' using errcode = 'P0002';
  end if;

  if v_tipster.status <> 'pending' then
    raise exception 'Only pending applications can be reviewed' using errcode = '22023';
  end if;

  update public.tipsters
  set status = p_decision, updated_at = now()
  where id = p_tipster_id;

  update public.profiles
  set role = case when p_decision = 'approved' then 'tipster' else 'customer' end,
      updated_at = now()
  where id = v_tipster.user_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, details)
  values
    (auth.uid(),
     case when p_decision = 'approved' then 'tipster_application_approved'
          else 'tipster_application_rejected' end,
     'tipster',
     p_tipster_id,
     nullif(trim(coalesce(p_reason, '')), ''),
     jsonb_build_object('username', v_tipster.username, 'decision', p_decision));

  return jsonb_build_object('success', true, 'tipster_id', p_tipster_id, 'decision', p_decision);
end;
$$;

revoke all on function public.review_tipster_application(uuid, text, text) from public, anon;
grant execute on function public.review_tipster_application(uuid, text, text) to authenticated;

commit;
