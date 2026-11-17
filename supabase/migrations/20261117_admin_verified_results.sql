-- IDEAS APP: admin-verified tipster result submissions.
-- Run in the IDEAS APP Supabase SQL Editor (project hclgguciyhdqaqsvuddp).
-- This is an incremental migration; do not run it in JM SHOP.

begin;

alter table public.result_submissions
  add column if not exists evidence_path text;

-- A tipster may have one pending or approved result per slip.
-- Rejected submissions remain in history and can be resubmitted.
create unique index if not exists result_submissions_one_active_per_slip
  on public.result_submissions (slip_id)
  where status in ('pending','approved');

-- The browser may submit only a pending claim for the user's own completed slip.
drop policy if exists "ideas_results_tipster_submit" on public.result_submissions;
create policy "ideas_results_tipster_submit"
on public.result_submissions
for insert to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'pending'
  and evidence_path is not null
  and (storage.foldername(evidence_path))[1] = auth.uid()::text
  and exists (
    select 1
    from public.betslips b
    join public.tipsters t on t.id = b.tipster_id
    where b.id = slip_id
      and t.user_id = auth.uid()
      and t.status = 'approved'
      and b.status in ('published','expired')
      and b.expires_at <= now()
  )
);

-- Result decisions must go through the admin-only SECURITY DEFINER function.
revoke update, delete on public.result_submissions from anon, authenticated;
grant select, insert on public.result_submissions to authenticated;

-- Store proof screenshots privately. Never expose result evidence to customers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ideas-result-evidence',
  'ideas-result-evidence',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "ideas_result_evidence_tipster_upload" on storage.objects;
create policy "ideas_result_evidence_tipster_upload"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ideas-result-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.betslips b
    join public.tipsters t on t.id = b.tipster_id
    where b.id::text = (storage.foldername(name))[2]
      and t.user_id = auth.uid()
      and t.status = 'approved'
      and b.status in ('published','expired')
      and b.expires_at <= now()
  )
);

drop policy if exists "ideas_result_evidence_owner_admin_read" on storage.objects;
create policy "ideas_result_evidence_owner_admin_read"
on storage.objects
for select to authenticated
using (
  bucket_id = 'ideas-result-evidence'
  and (
    public.is_ideas_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "ideas_result_evidence_owner_admin_delete" on storage.objects;
create policy "ideas_result_evidence_owner_admin_delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'ideas-result-evidence'
  and (
    public.is_ideas_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Remove the earlier same-signature function so PostgreSQL accepts the renamed input parameter.
drop function if exists public.admin_review_result_submission(uuid, text, text);

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
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  select * into v_result
  from public.result_submissions
  where id = p_result_submission_id
  for update;

  if not found then
    raise exception 'Result submission not found' using errcode = 'P0002';
  end if;

  if v_result.status <> 'pending' then
    raise exception 'This result submission has already been reviewed' using errcode = '22023';
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

revoke all on function public.admin_review_result_submission(uuid, text, text) from public, anon;
grant execute on function public.admin_review_result_submission(uuid, text, text) to authenticated;

commit;
