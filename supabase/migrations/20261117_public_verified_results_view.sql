-- IDEAS APP: safely expose only administrator-approved result summaries.
-- Run this once in the IDEAS APP Supabase SQL Editor.
-- The view deliberately excludes notes, evidence paths, submitter IDs and review metadata.

begin;

create or replace view public.public_verified_results
with (security_barrier = true)
as
select
  r.id,
  r.slip_id,
  b.tipster_id,
  t.username,
  r.submitted_result,
  b.total_odds,
  b.betting_company,
  r.reviewed_at
from public.result_submissions r
join public.betslips b on b.id = r.slip_id
join public.tipsters t on t.id = b.tipster_id
where r.status = 'approved'
  and t.status = 'approved';

revoke all on public.public_verified_results from public;
grant select on public.public_verified_results to anon, authenticated;

commit;
