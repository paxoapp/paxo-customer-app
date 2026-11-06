-- Cashfree as a second payment gateway (behind a setting). Migration name: cashfree_gateway
-- NOT applied until the founder says "apply". Razorpay objects are not changed.
-- Booking rules, deposit amounts, refund rules, commission and Party Pool logic are not touched:
-- the only new thing that changes a booking is cashfree_apply_payment(), which does exactly what razorpay_apply_event()
-- does for a paid deposit (same checks, same late/duplicate handling), keyed on the Cashfree order id.

-- 1. The switch. Razorpay stays the default. cashfree_mode only matters while payment_provider = 'cashfree'.
alter table public.platform_settings
  add column payment_provider text not null default 'razorpay' check (payment_provider in ('razorpay', 'cashfree')),
  add column cashfree_mode text not null default 'sandbox' check (cashfree_mode in ('sandbox', 'production'));

-- 2. Cashfree ids on the payment. razorpay_* columns are left alone (the Razorpay refund job and refund function key on them).
alter table public.payments
  add column provider text not null default 'razorpay' check (provider in ('razorpay', 'cashfree')),
  add column cashfree_order_id text,
  add column cashfree_payment_id text;
create unique index payments_cashfree_order_uq on public.payments (cashfree_order_id) where cashfree_order_id is not null;
create unique index payments_cashfree_payment_uq on public.payments (cashfree_payment_id) where cashfree_payment_id is not null;

-- 3. What the app may read: the provider and (for Cashfree) sandbox/production. Nothing else from platform_settings.
create or replace function public.get_payment_provider()
returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object('provider', s.payment_provider,
                            'mode', case when s.payment_provider = 'cashfree' then s.cashfree_mode else null end)
    from public.platform_settings s order by s.id limit 1
$f$;
revoke execute on function public.get_payment_provider() from public;
grant execute on function public.get_payment_provider() to anon, authenticated, service_role;

-- 4. Webhook event log (dedupe + audit). RLS on, no policies, no grants: only the functions below touch it.
create table public.cashfree_events (
  event_key text primary key,
  event_type text not null,
  payload jsonb not null,
  attempts int not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text
);
alter table public.cashfree_events enable row level security;
revoke all on public.cashfree_events from public, anon, authenticated;

-- 'new' = first time seen, 'retry' = seen but not finished, 'done' = already processed (safe to ignore).
-- Customer contact details and payment instrument details are stripped before the payload is stored.
create or replace function public.cashfree_record_event(p_key text, p_type text, p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $f$
declare v_done timestamptz; v_n int;
begin
  insert into cashfree_events (event_key, event_type, payload)
  values (left(p_key, 200), left(p_type, 100),
          p_payload #- '{data,customer_details}' #- '{data,payment,payment_method}' #- '{data,payment,auth_id}')
  on conflict (event_key) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 then return 'new'; end if;
  select processed_at into v_done from cashfree_events where event_key = left(p_key, 200);
  if v_done is not null then return 'done'; end if;
  update cashfree_events set attempts = attempts + 1 where event_key = left(p_key, 200);
  return 'retry';
end $f$;

create or replace function public.cashfree_finish_event(p_key text, p_result text)
returns void language sql security definer set search_path = public as $f$
  update cashfree_events set processed_at = now(), result = left(p_result, 300) where event_key = left(p_key, 200) and processed_at is null
$f$;

-- 5. A payment Cashfree itself reports as successful (the edge function has already asked Cashfree for the order status
--    and the payment list: the amount here comes from Cashfree's reply, never from the browser).
create or replace function public.cashfree_apply_payment(p_order_id text, p_cf_payment_id text, p_amount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  p record; b record; other_paid boolean; v_result text; v_fee numeric; v_tax numeric;
begin
  if p_order_id is null or p_cf_payment_id is null or p_amount is null then
    return jsonb_build_object('result', 'malformed');
  end if;
  select * into p from payments where cashfree_order_id = p_order_id for update;
  if p.id is null then
    v_result := 'unknown order';
  elsif p.provider <> 'cashfree' then
    v_result := 'ignored: not a Cashfree payment';
  elsif p.payment_type not in ('deposit', 'full') then
    v_result := 'ignored: not a deposit payment';
  elsif coalesce(p_currency, 'INR') <> 'INR' or round(p_amount * 100) <> round(p.amount * 100) then
    v_result := 'amount mismatch';
    insert into admin_alerts (kind, booking_id, payment_id, message, urgent)
    values ('payment_amount_mismatch', p.booking_id, p.id,
            format('Cashfree reported a payment of %s %s for an order that PAXO expected to be ₹%s. The payment was NOT marked paid. Please check it in Cashfree.', p_amount, coalesce(p_currency, 'INR'), p.amount), true);
  elsif p.status = 'paid' then
    v_result := 'already paid';
  elsif exists (select 1 from payments x where x.cashfree_payment_id = p_cf_payment_id and x.id <> p.id) then
    v_result := 'duplicate payment id';
  else
    select id, status, booking_ref into b from bookings where id = p.booking_id for update;
    other_paid := exists (select 1 from payments x
                           where x.booking_id = p.booking_id and x.id <> p.id and x.status = 'paid'
                             and x.payment_type in ('deposit', 'full'));
    -- Cashfree's real fee arrives later (cashfree_apply_charges); until then this is the same estimate Razorpay uses, flagged as an estimate.
    v_fee := round(p.amount * 0.02 * 1.18, 2);
    v_tax := round(p.amount * 0.02 * 0.18, 2);

    if not other_paid and b.status in ('accepted', 'confirmed', 'completed') then
      update payments
         set status = 'paid', cashfree_payment_id = p_cf_payment_id, paid_at = now(),
             gateway_fee = v_fee, gateway_tax = v_tax, gateway_fee_estimated = true
       where id = p.id;
      if b.status = 'accepted' then
        update bookings set status = 'confirmed' where id = b.id and status = 'accepted';
        v_result := 'paid, booking confirmed';
      else
        v_result := 'paid (booking already ' || b.status || ')';
      end if;
    else
      -- late or second payment: kept as paid, marked for a full refund. Refunds are manual at launch, so NO retry is scheduled
      -- (refund_next_retry_at stays null, which keeps the Razorpay refund job away from it) and an urgent alert is raised.
      update payments
         set status = 'paid', cashfree_payment_id = p_cf_payment_id, paid_at = now(),
             gateway_fee = v_fee, gateway_tax = v_tax, gateway_fee_estimated = true,
             refund_amount = p.amount, refund_percent = 100, refund_status = 'pending',
             forfeited_amount = 0, gateway_fee_deducted = 0, refund_attempts = 0, refund_last_error = null,
             refund_next_retry_at = null
       where id = p.id;
      update booking_deposit_holds set release_status = 'void', release_amount = 0, updated_at = now()
       where payment_id = p.id and release_status in ('held', 'releasable');
      if not other_paid then
        update booking_commissions set status = 'cancelled'
         where booking_id = p.booking_id and kind = 'commission' and status = 'pending';
      end if;
      insert into admin_alerts (kind, booking_id, payment_id, message, urgent)
      values (case when other_paid then 'duplicate_payment_refund' else 'late_payment_refund' end, p.booking_id, p.id,
              case when other_paid
                then format('A second payment of ₹%s arrived (Cashfree payment %s) for booking %s, which was already paid. Please refund it in full by hand in Cashfree.', p.amount, p_cf_payment_id, b.booking_ref)
                else format('A payment of ₹%s arrived (Cashfree payment %s) for booking %s after it had ended (%s). The booking was not confirmed. Please refund it in full by hand in Cashfree.', p.amount, p_cf_payment_id, b.booking_ref, b.status)
              end, true);
      v_result := case when other_paid then 'second payment: manual refund needed' else 'late payment: manual refund needed' end;
    end if;
  end if;
  return jsonb_build_object('result', v_result);
end $f$;

-- 6. Cashfree's real fee (PAYMENT_CHARGES_WEBHOOK). Only fills the fee fields of an already-paid Cashfree payment.
create or replace function public.cashfree_apply_charges(p_order_id text, p_service_charge numeric, p_service_tax numeric)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare p record;
begin
  select * into p from payments where cashfree_order_id = p_order_id for update;
  if p.id is null then return jsonb_build_object('result', 'unknown order'); end if;
  if p.status <> 'paid' then return jsonb_build_object('result', 'ignored: not paid yet'); end if;
  if p_service_charge is null or p_service_tax is null or p_service_charge < 0 or p_service_tax < 0 then
    return jsonb_build_object('result', 'malformed charges');
  end if;
  update payments set gateway_fee = round(p_service_charge + p_service_tax, 2), gateway_tax = round(p_service_tax, 2), gateway_fee_estimated = false
   where id = p.id;
  return jsonb_build_object('result', 'fee stored');
end $f$;

-- Everything internal: service role (the edge functions) only.
revoke execute on function public.cashfree_record_event(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cashfree_finish_event(text, text) from public, anon, authenticated;
revoke execute on function public.cashfree_apply_payment(text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.cashfree_apply_charges(text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.cashfree_record_event(text, text, jsonb) to service_role;
grant execute on function public.cashfree_finish_event(text, text) to service_role;
grant execute on function public.cashfree_apply_payment(text, text, numeric, text) to service_role;
grant execute on function public.cashfree_apply_charges(text, numeric, numeric) to service_role;
