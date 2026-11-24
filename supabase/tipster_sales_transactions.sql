-- Tipster-only read access to their own confirmed sales, without exposing customer identity.
create or replace function public.get_my_tipster_sales()
returns table (
  purchase_id uuid,
  slip_id uuid,
  betting_company text,
  total_odds numeric,
  amount_tzs bigint,
  paid_at timestamptz,
  purchase_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.tipsters t
    where t.user_id = auth.uid() and t.status = 'approved'
  ) then
    raise exception 'Approved tipster account required';
  end if;

  return query
  select p.id, b.id, b.betting_company, b.total_odds,
         p.amount_tzs, p.paid_at, p.created_at
  from public.purchases p
  join public.betslips b on b.id = p.slip_id
  join public.tipsters t on t.id = b.tipster_id
  where t.user_id = auth.uid()
    and t.status = 'approved'
    and p.status = 'paid'
  order by coalesce(p.paid_at,p.created_at) desc;
end;
$$;

revoke all on function public.get_my_tipster_sales() from public, anon;
grant execute on function public.get_my_tipster_sales() to authenticated;
