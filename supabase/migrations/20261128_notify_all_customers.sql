-- Notify every registered customer when an approved tipster publishes a betslip.
begin;

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
  where t.id = new.tipster_id
    and t.status = 'approved';

  if v_username is null then
    return new;
  end if;

  insert into public.customer_notifications
    (recipient_id, notification_type, title, message, related_slip_id)
  select p.id,
         'new_betslip',
         'New betslip available',
         '@' || v_username || ' has published a new betslip. Open IDEAS APP to view it.',
         new.id
  from public.profiles p
  where p.role = 'customer';

  return new;
end;
$$;

drop trigger if exists ideas_notify_followers_new_betslip on public.betslips;
create trigger ideas_notify_followers_new_betslip
after insert or update of status on public.betslips
for each row
execute function public.notify_followers_of_new_betslip();

DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$realtime$;

notify pgrst, 'reload schema';
commit;
