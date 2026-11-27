-- IDEAS APP: customer in-app notifications, owner-wide sales reporting, and Instagram banner destinations.
begin;

alter table public.announcements
  add column if not exists redirect_url text;

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null default 'new_betslip',
  title text not null,
  message text not null,
  related_slip_id uuid references public.betslips(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_notifications_recipient_created_idx
  on public.customer_notifications(recipient_id, created_at desc);

alter table public.customer_notifications enable row level security;
drop policy if exists ideas_notifications_read_own on public.customer_notifications;
create policy ideas_notifications_read_own on public.customer_notifications
  for select to authenticated using (recipient_id = auth.uid());
drop policy if exists ideas_notifications_update_own on public.customer_notifications;
create policy ideas_notifications_update_own on public.customer_notifications
  for update to authenticated using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
revoke all on public.customer_notifications from anon;
revoke insert, delete on public.customer_notifications from anon, authenticated;
grant select on public.customer_notifications to authenticated;
grant update (read_at) on public.customer_notifications to authenticated;

create or replace function public.notify_followers_of_new_betslip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  select t.username into v_username
  from public.tipsters t
  where t.id = new.tipster_id and t.status = 'approved';

  if v_username is null then
    return new;
  end if;

  insert into public.customer_notifications
    (recipient_id, notification_type, title, message, related_slip_id)
  select f.follower_id, 'new_betslip',
         'New betslip from @' || v_username,
         '@' || v_username || ' has published a new betslip. Open IDEAS APP to view it.',
         new.id
  from public.tipster_follows f
  where f.tipster_id = new.tipster_id;

  return new;
end;
$$;

drop trigger if exists ideas_notify_followers_new_betslip on public.betslips;
create trigger ideas_notify_followers_new_betslip
after insert or update of status on public.betslips
for each row execute function public.notify_followers_of_new_betslip();

create or replace function public.admin_get_all_sales_transactions()
returns table (
  purchase_id uuid,
  tipster_id uuid,
  username text,
  display_name text,
  slip_id uuid,
  betting_company text,
  total_odds numeric,
  amount_tzs bigint,
  purchase_status text,
  paid_at timestamptz,
  purchase_created_at timestamptz,
  customer_name text,
  customer_phone text,
  provider text,
  provider_reference text,
  payment_status text,
  provider_phone text,
  transaction_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  return query
  select p.id, t.id, t.username, seller.display_name,
         b.id, b.betting_company, b.total_odds, p.amount_tzs,
         p.status, p.paid_at, p.created_at,
         buyer.display_name, buyer.phone,
         pt.provider, pt.provider_reference, pt.status, pt.phone, pt.created_at
  from public.purchases p
  join public.betslips b on b.id = p.slip_id
  join public.tipsters t on t.id = b.tipster_id
  left join public.profiles seller on seller.id = t.user_id
  left join public.profiles buyer on buyer.id = p.customer_id
  left join public.payment_transactions pt on pt.purchase_id = p.id
  order by coalesce(pt.created_at,p.paid_at,p.created_at) desc;
end;
$$;

revoke all on function public.admin_get_all_sales_transactions() from public, anon;
grant execute on function public.admin_get_all_sales_transactions() to authenticated;

commit;
