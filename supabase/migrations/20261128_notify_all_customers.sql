-- Notify every registered customer when an approved tipster publishes a betslip.
begin;

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

notify pgrst, 'reload schema';
commit;
