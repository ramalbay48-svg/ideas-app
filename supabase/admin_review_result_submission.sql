-- IDEAS APP: secure administrator review for tipster result submissions.
-- Run this in the IDEAS APP Supabase project's SQL Editor (not JM SHOP).

create or replace function public.admin_review_result_submission(
  p_result_submission_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_result public.result_submissions%rowtype;
begin
  if v_admin_id is null or not public.is_ideas_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_result
  from public.result_submissions
  where id = p_result_submission_id
  for update;

  if not found then
    raise exception 'Result submission not found';
  end if;

  if v_result.status <> 'pending' then
    raise exception 'This result submission has already been reviewed';
  end if;

  update public.result_submissions
  set status = p_decision,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      review_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_result_submission_id;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, reason, details
  ) values (
    v_admin_id,
    'result_' || p_decision,
    'result_submission',
    p_result_submission_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'slip_id', v_result.slip_id,
      'submitted_by', v_result.submitted_by,
      'submitted_result', v_result.submitted_result
    )
  );
end;
$$;

revoke all on function public.admin_review_result_submission(uuid, text, text) from public;
revoke all on function public.admin_review_result_submission(uuid, text, text) from anon;
grant execute on function public.admin_review_result_submission(uuid, text, text) to authenticated;
