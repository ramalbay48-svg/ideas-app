-- IDEAS APP: safe history archiving. Never hard-delete paid slips or financial records.
begin;

alter table public.result_submissions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

create index if not exists result_submissions_visible_idx
  on public.result_submissions(created_at desc) where archived_at is null;

create table if not exists public.history_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null check (target_type in ('betslip','result_submission')),
  target_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.history_action_logs enable row level security;
drop policy if exists "ideas_history_logs_admin_read" on public.history_action_logs;
create policy "ideas_history_logs_admin_read" on public.history_action_logs
  for select to authenticated using (public.is_ideas_admin());
revoke all on public.history_action_logs from anon, authenticated;
grant select on public.history_action_logs to authenticated;

create or replace function public.archive_ideas_betslip(p_slip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_tipster_user uuid;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select t.user_id into v_tipster_user
    from public.betslips b join public.tipsters t on t.id=b.tipster_id
    where b.id=p_slip_id;
  if v_tipster_user is null then raise exception 'Betslip not found'; end if;
  if v_tipster_user <> v_actor and not public.is_ideas_admin() then
    raise exception 'You are not allowed to remove this betslip';
  end if;
  update public.betslips set status='removed', updated_at=now() where id=p_slip_id;
  insert into public.history_action_logs(actor_id,action,target_type,target_id)
    values(v_actor,'archive','betslip',p_slip_id);
  if public.is_ideas_admin() then
    insert into public.admin_audit_logs(admin_id,action,target_type,target_id,reason,details)
      values(v_actor,'archive_betslip','betslip',p_slip_id,'Removed from active history; purchases preserved','{"safe_archive":true}'::jsonb);
  end if;
end;
$$;

create or replace function public.archive_ideas_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_submitter uuid; v_owner uuid;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select r.submitted_by,t.user_id into v_submitter,v_owner
    from public.result_submissions r
    join public.betslips b on b.id=r.slip_id
    join public.tipsters t on t.id=b.tipster_id
    where r.id=p_result_id;
  if v_submitter is null then raise exception 'Result report not found'; end if;
  if v_actor <> v_submitter and v_actor <> v_owner and not public.is_ideas_admin() then
    raise exception 'You are not allowed to archive this result report';
  end if;
  update public.result_submissions set archived_at=coalesce(archived_at,now()), archived_by=v_actor
    where id=p_result_id;
  insert into public.history_action_logs(actor_id,action,target_type,target_id)
    values(v_actor,'archive','result_submission',p_result_id);
  if public.is_ideas_admin() then
    insert into public.admin_audit_logs(admin_id,action,target_type,target_id,reason,details)
      values(v_actor,'archive_result_submission','result_submission',p_result_id,'Archived result report; original record retained','{"safe_archive":true}'::jsonb);
  end if;
end;
$$;

revoke all on function public.archive_ideas_betslip(uuid) from public, anon;
revoke all on function public.archive_ideas_result(uuid) from public, anon;
grant execute on function public.archive_ideas_betslip(uuid) to authenticated;
grant execute on function public.archive_ideas_result(uuid) to authenticated;

commit;
