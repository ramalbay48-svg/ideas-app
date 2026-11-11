-- IDEAS APP: safely create a pending customer purchase before payment is connected.
-- Run this file once in Supabase SQL Editor.
-- This function NEVER marks a purchase as paid and NEVER sends a payment request.

begin;

create or replace function public.create_checkout_purchase(
  p_slip_id uuid,
  p_provider text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_customer_id uuid := auth.uid();
  v_amount bigint;
  v_purchase_id uuid;
  v_purchase_status text;
begin
  if v_customer_id is null then
    raise exception 'Please log in before starting checkout.';
  end if;

  if p_slip_id is null then
    raise exception 'Choose a valid betslip.';
  end if;

  if p_provider not in ('M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa') then
    raise exception 'Choose a supported mobile money provider.';
  end if;

  if p_phone !~ '^\+255[67][0-9]{8}$' then
    raise exception 'Enter a valid Tanzanian mobile money number.';
  end if;

  -- Always take the price from the published database record, never from the app.
  select b.price_tzs
    into v_amount
    from public.betslips b
    join public.tipsters t on t.id = b.tipster_id
   where b.id = p_slip_id
     and b.status = 'published'
     and b.expires_at > now()
     and t.user_id <> v_customer_id;

  if v_amount is null then
    raise exception 'This betslip is unavailable, expired, or belongs to your account.';
  end if;

  -- A buyer can have only one purchase record for each slip.
  insert into public.purchases (customer_id, slip_id, amount_tzs, status)
  values (v_customer_id, p_slip_id, v_amount, 'pending')
  on conflict (customer_id, slip_id) do nothing;

  select p.id, p.status
    into v_purchase_id, v_purchase_status
    from public.purchases p
   where p.customer_id = v_customer_id
     and p.slip_id = p_slip_id;

  if v_purchase_status <> 'paid' then
    -- Keep a single matching pending attempt when the customer taps twice.
    if not exists (
      select 1
        from public.payment_transactions pt
       where pt.purchase_id = v_purchase_id
         and pt.provider = p_provider
         and pt.phone = p_phone
         and pt.status = 'pending'
    ) then
      insert into public.payment_transactions
        (purchase_id, provider, phone, amount_tzs, status)
      values
        (v_purchase_id, p_provider, p_phone, v_amount, 'pending');
    end if;
  end if;

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'status', v_purchase_status,
    'amount_tzs', v_amount,
    'payment_active', false
  );
end;
$$;

revoke all on function public.create_checkout_purchase(uuid, text, text) from public;
revoke all on function public.create_checkout_purchase(uuid, text, text) from anon;
grant execute on function public.create_checkout_purchase(uuid, text, text) to authenticated;

commit;
