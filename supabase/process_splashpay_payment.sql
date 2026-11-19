-- IDEAS APP: atomically reconcile SplashPay webhook events with purchases.
-- Run once in the dedicated IDEAS APP Supabase SQL Editor.

create or replace function public.process_splashpay_payment(
  p_reference text,
  p_amount numeric,
  p_event text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_purchase public.purchases%rowtype;
  v_new_status text;
begin
  if p_reference is null or length(p_reference) < 1
     or p_amount is null or p_amount <= 0
     or p_event not in (
       'payment.success','payment.failed','payment.cancelled',
       'payment.expired','payment.user_cancelled','payment.in_progress',
       'payment.pending','payment.rejected'
     ) then
    raise exception 'Invalid SplashPay payment event.';
  end if;

  select * into v_payment
    from public.payment_transactions
   where provider = 'SplashPay'
     and provider_reference = p_reference
   for update;

  if not found then
    return jsonb_build_object('matched', false, 'reason', 'reference_not_found');
  end if;

  if v_payment.amount_tzs::numeric <> p_amount then
    raise exception 'Payment amount does not match the pending purchase.';
  end if;

  select * into v_purchase
    from public.purchases
   where id = v_payment.purchase_id
   for update;

  if not found or v_purchase.amount_tzs::numeric <> p_amount then
    raise exception 'Purchase amount does not match the payment.';
  end if;

  if p_event = 'payment.success' then
    if v_payment.status not in ('pending','successful') then
      raise exception 'Payment is already in a terminal non-success state.';
    end if;

    update public.payment_transactions
       set status = 'successful',
           provider_payload = p_payload,
           verified_at = coalesce(verified_at, now())
     where id = v_payment.id;

    update public.purchases
       set status = 'paid',
           paid_at = coalesce(paid_at, now())
     where id = v_purchase.id
       and status <> 'paid';

    return jsonb_build_object('matched', true, 'paid', true, 'purchase_id', v_purchase.id);
  elsif p_event in ('payment.failed','payment.rejected','payment.expired') then
    v_new_status := 'failed';
  elsif p_event in ('payment.cancelled','payment.user_cancelled') then
    v_new_status := 'cancelled';
  else
    update public.payment_transactions
       set provider_payload = p_payload
     where id = v_payment.id;
    return jsonb_build_object('matched', true, 'paid', false, 'pending', true);
  end if;

  if v_payment.status = 'pending' then
    update public.payment_transactions
       set status = v_new_status,
           provider_payload = p_payload,
           verified_at = now()
     where id = v_payment.id;

    update public.purchases
       set status = 'failed'
     where id = v_purchase.id
       and status = 'pending';
  end if;

  return jsonb_build_object('matched', true, 'paid', false, 'status', v_new_status);
end;
$$;

revoke all on function public.process_splashpay_payment(text,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.process_splashpay_payment(text,numeric,text,jsonb) to service_role;
