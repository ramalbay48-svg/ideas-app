-- IDEAS APP: let customers read metadata and private image for slips they already paid for,
-- even after the marketplace expiry time or after a tipster archives the listing.
-- Run once in the IDEAS APP Supabase SQL Editor (not JM SHOP).

drop policy if exists "ideas_betslips_read_published" on public.betslips;

create policy "ideas_betslips_read_published"
on public.betslips
for select
to anon, authenticated
using (
  (status = 'published' and expires_at > now())
  or exists (
    select 1
    from public.tipsters t
    where t.id = tipster_id
      and t.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.purchases p
    where p.slip_id = betslips.id
      and p.customer_id = auth.uid()
      and p.status = 'paid'
  )
  or public.is_ideas_admin()
);
