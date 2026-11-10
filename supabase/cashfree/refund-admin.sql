-- Admin action for manual Cashfree refunds. Migration name: cashfree_refund_admin. NOT applied until the founder says "apply".
-- Nothing existing changes: one new nullable column and one new function.
--
-- Flow: customer cancels a Cashfree-paid booking -> process-booking-refund (patched) cancels the booking, records the refund as
-- 'pending' with NO retry time and raises an urgent alert with the Cashfree payment id -> the founder refunds by hand in the
-- Cashfree dashboard -> presses "Mark refunded" in the admin app -> this function records it.
-- Marking it processed fires the existing triggers exactly as a Razorpay refund does (customer refund email, deposit hold / settlement sync).

alter table public.payments add column cashfree_refund_id text;

create or replace function public.admin_mark_cashfree_refund_processed(p_payment_id uuid, p_cashfree_refund_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  p record; v_old text; v_ref text := nullif(left(btrim(coalesce(p_cashfree_refund_id, '')), 100), '');
begin
  if auth.uid() is null or not exists (select 1 from admin_users au where au.id = auth.uid()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into p from payments where id = p_payment_id for update;
  if p.id is null then return jsonb_build_object('ok', false, 'result', 'payment not found'); end if;
  if p.provider <> 'cashfree' then return jsonb_build_object('ok', false, 'result', 'not a Cashfree payment'); end if;
  if p.refund_status <> 'pending' or coalesce(p.refund_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'result', 'no pending refund on this payment');
  end if;

  -- the payments protect trigger only lets the service role change refund fields; this function has just proved the caller is an
  -- admin, so it raises the role for this one statement (transaction-local) and puts the caller's claims back straight after.
  v_old := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update payments
     set refund_status = 'processed', refunded_at = now(), cashfree_refund_id = v_ref,
         refund_last_error = null, refund_next_retry_at = null
   where id = p.id;
  perform set_config('request.jwt.claims', coalesce(v_old, ''), true);

  update admin_alerts set resolved_at = now()
   where payment_id = p.id and resolved_at is null
     and kind in ('refund_pending', 'duplicate_payment_refund', 'late_payment_refund');
  return jsonb_build_object('ok', true, 'result', 'refund marked as processed');
end $f$;

revoke execute on function public.admin_mark_cashfree_refund_processed(uuid, text) from public, anon;
grant execute on function public.admin_mark_cashfree_refund_processed(uuid, text) to authenticated, service_role;
