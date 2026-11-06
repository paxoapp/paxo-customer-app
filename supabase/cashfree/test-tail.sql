
do $t$
declare
  o text := ''; bk uuid; pid uuid; pid2 uuid; res jsonb; r record; n int;
  oid1 text := 'PXTEST' || repeat('a', 20); oid2 text := 'PXTEST' || repeat('b', 20);
begin
  -- the edge functions call these as the service role (the payments protect trigger checks auth.role())
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- setting + reader
  o := o || (case when (select payment_provider from platform_settings limit 1) = 'razorpay' then 'PASS default stays razorpay' else 'FAIL default' end);
  set local role anon;
  res := get_payment_provider();
  reset role;
  o := o || ' | ' || (case when res->>'provider' = 'razorpay' and res->'mode' = 'null'::jsonb then 'PASS anon reads provider only (no mode while razorpay)' else 'FAIL reader '||res::text end);
  begin set local role anon; perform cashfree_apply_payment('x','y',1,'INR'); reset role; o := o||' | FAIL anon apply'; exception when insufficient_privilege then reset role; o := o||' | PASS anon cannot apply'; end;
  begin set local role authenticated; perform cashfree_record_event('k','t','{}'::jsonb); reset role; o := o||' | FAIL auth record'; exception when insufficient_privilege then reset role; o := o||' | PASS authenticated cannot record events'; end;
  begin set local role anon; perform 1 from cashfree_events; reset role; o := o||' | FAIL events readable'; exception when insufficient_privilege then reset role; o := o||' | PASS events table locked'; end;

  -- fixture (an old booking with no payments; the deposit-hold trigger only fires for rules_version >= 2, same as for Razorpay): an existing booking put into 'accepted' with a Cashfree order
  select b.id into bk from bookings b where not exists (select 1 from payments p where p.booking_id = b.id) order by b.created_at limit 1;
  update bookings set status = 'accepted' where id = bk;
  insert into payments (booking_id, amount, payment_type, status, provider, cashfree_order_id) values (bk, 500, 'deposit', 'created', 'cashfree', oid1) returning id into pid;

  -- wrong amount: not paid, alert raised
  res := cashfree_apply_payment(oid1, '9001', 400, 'INR');
  o := o || ' | ' || (case when res->>'result' = 'amount mismatch' and (select status from payments where id = pid) = 'created' and (select status from bookings where id = bk) = 'accepted' then 'PASS wrong amount leaves payment+booking unchanged' else 'FAIL mismatch '||res::text end);
  o := o || ' | ' || (case when exists (select 1 from admin_alerts where payment_id = pid and kind = 'payment_amount_mismatch') then 'PASS mismatch alert raised' else 'FAIL alert' end);
  res := cashfree_apply_payment(oid1, '9001', 500, 'USD');
  o := o || ' | ' || (case when res->>'result' = 'amount mismatch' then 'PASS wrong currency refused' else 'FAIL currency' end);
  res := cashfree_apply_payment('NOPE', '9001', 500, 'INR');
  o := o || ' | ' || (case when res->>'result' = 'unknown order' then 'PASS unknown order ignored' else 'FAIL unknown' end);

  -- the good payment
  res := cashfree_apply_payment(oid1, '9001', 500, 'INR');
  select * into r from payments where id = pid;
  o := o || ' | ' || (case when res->>'result' = 'paid, booking confirmed' and r.status = 'paid' and r.cashfree_payment_id = '9001' and r.paid_at is not null and r.gateway_fee_estimated and r.razorpay_payment_id is null then 'PASS paid + cashfree id stored, razorpay id untouched' else 'FAIL paid '||res::text end);
  o := o || ' | ' || (case when (select status from bookings where id = bk) = 'confirmed' then 'PASS booking confirmed' else 'FAIL booking' end);
  o := o || ' | ' || (case when exists (select 1 from booking_commissions where booking_id = bk and kind = 'commission' and status <> 'cancelled') then 'PASS commission created by existing trigger' else 'FAIL commission' end);

  -- twice is safe
  res := cashfree_apply_payment(oid1, '9001', 500, 'INR');
  o := o || ' | ' || (case when res->>'result' = 'already paid' then 'PASS second apply is a no-op' else 'FAIL twice '||res::text end);
  select count(*) into n from payments where booking_id = bk and status = 'paid';
  o := o || ' | ' || (case when n = 1 then 'PASS still exactly one paid payment' else 'FAIL paid count '||n end);

  -- real fee arrives
  res := cashfree_apply_charges(oid1, 8.5, 1.53);
  select * into r from payments where id = pid;
  o := o || ' | ' || (case when r.gateway_fee = 10.03 and r.gateway_tax = 1.53 and r.gateway_fee_estimated = false then 'PASS real fee stored' else 'FAIL fee '||res::text end);

  -- a retired (failed) second order that Cashfree later reports as paid, on an already-paid booking: kept for manual refund, no auto retry scheduled
  insert into payments (booking_id, amount, payment_type, status, provider, cashfree_order_id) values (bk, 500, 'deposit', 'failed', 'cashfree', oid2) returning id into pid2;
  res := cashfree_apply_payment(oid2, '9002', 500, 'INR');
  select * into r from payments where id = pid2;
  o := o || ' | ' || (case when res->>'result' = 'second payment: manual refund needed' and r.refund_status = 'pending' and r.refund_next_retry_at is null and r.refund_percent = 100 then 'PASS second payment flagged for manual refund, Razorpay job never retries it' else 'FAIL second '||res::text end);
  o := o || ' | ' || (case when (select status from bookings where id = bk) = 'confirmed' and exists (select 1 from admin_alerts where payment_id = pid2 and kind = 'duplicate_payment_refund' and urgent) then 'PASS booking unchanged, urgent alert' else 'FAIL second alert' end);

  -- a balance-type order is ignored
  insert into payments (booking_id, amount, payment_type, status, provider, cashfree_order_id) values (bk, 700, 'balance', 'failed', 'cashfree', 'PXTESTcccccccccccccccccccc');
  res := cashfree_apply_payment('PXTESTcccccccccccccccccccc', '9003', 700, 'INR');
  o := o || ' | ' || (case when res->>'result' = 'ignored: not a deposit payment' then 'PASS balance type ignored' else 'FAIL balance '||res::text end);

  -- event log: new / retry / done, personal details stripped
  o := o || ' | ' || (case when cashfree_record_event('ev1', 'PAYMENT_SUCCESS_WEBHOOK', '{"data":{"customer_details":{"customer_phone":"999"},"payment":{"payment_method":{"upi":{"upi_id":"a@b"}},"cf_payment_id":"1"}}}'::jsonb) = 'new' then 'PASS event new' else 'FAIL ev new' end);
  o := o || ' | ' || (case when cashfree_record_event('ev1', 'PAYMENT_SUCCESS_WEBHOOK', '{}'::jsonb) = 'retry' then 'PASS same event before finish = retry' else 'FAIL ev retry' end);
  perform cashfree_finish_event('ev1', 'ok');
  o := o || ' | ' || (case when cashfree_record_event('ev1', 'PAYMENT_SUCCESS_WEBHOOK', '{}'::jsonb) = 'done' then 'PASS finished event = done (safe to receive twice)' else 'FAIL ev done' end);
  o := o || ' | ' || (case when (select payload::text from cashfree_events where event_key = 'ev1') !~ '999|a@b' then 'PASS phone and UPI id not stored' else 'FAIL pii' end);

  raise exception 'ROLLBACK_RESULTS %', replace(o, ' | ', E'\n');
end $t$;
