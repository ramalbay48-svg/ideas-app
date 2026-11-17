-- IDEAS APP: customer-to-tipster follows and public follower totals.
begin;

create table if not exists public.tipster_follows (
  tipster_id uuid not null references public.tipsters(id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tipster_id, follower_id)
);

create index if not exists tipster_follows_follower_idx
  on public.tipster_follows(follower_id, created_at desc);

alter table public.tipster_follows enable row level security;

drop policy if exists "ideas_follows_read_own" on public.tipster_follows;
create policy "ideas_follows_read_own" on public.tipster_follows
for select to authenticated using (follower_id = auth.uid());

drop policy if exists "ideas_follows_insert_own" on public.tipster_follows;
create policy "ideas_follows_insert_own" on public.tipster_follows
for insert to authenticated with check (
  follower_id = auth.uid()
  and exists (
    select 1 from public.tipsters t
    where t.id = tipster_id and t.status = 'approved'
  )
);

drop policy if exists "ideas_follows_delete_own" on public.tipster_follows;
create policy "ideas_follows_delete_own" on public.tipster_follows
for delete to authenticated using (follower_id = auth.uid());

revoke all on public.tipster_follows from anon;
revoke insert, update, delete on public.tipster_follows from anon, authenticated;
grant select on public.tipster_follows to authenticated;
grant insert, delete on public.tipster_follows to authenticated;

create or replace view public.public_tipster_follower_counts
with (security_barrier = true)
as
select tipster_id, count(*)::bigint as follower_count
from public.tipster_follows
group by tipster_id;

revoke all on public.public_tipster_follower_counts from public;
grant select on public.public_tipster_follower_counts to anon, authenticated;

commit;
