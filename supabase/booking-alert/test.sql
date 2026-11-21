-- Rollback test for booking-alert. Runs the migration and three throwaway bookings on the demo venue Illusion INSIDE ONE
-- TRANSACTION, reports what it saw in the error text, and then raises on purpose so EVERYTHING is rolled back (no tables, no
-- bookings, no alert rows are left behind; the only thing that is not rolled back is the booking_ref sequence counter).
-- To run it, put the contents of migration.sql in place of the single marker line inside the execute $m$ ... $m$ block below.
do $outer$
declare
  v_illusion uuid := '5a81eaee-8427-40db-b1ab-ea2537e09f52';
  v_pkg      uuid := 'a731c99c-2f6b-41e2-9cbc-03954b144599';   -- Illusion "Food Package"
  v_cust_a   uuid := '6c38f55d-5f29-48d1-9e74-d42aba9e2fcd';   -- existing test customer
  v_cust_b   uuid := 'f57f3152-c53b-4484-b9c0-85bac2a6c71e';
  b1 uuid; b2 uuid; b3 uuid;
  r jsonb := '{}'::jsonb;
begin
  execute $m$
-- MIGRATION GOES HERE
  $m$;

  -- A. normal request: expect ONE log row, channel email, status queued, with a pg_net request id, and one queued request
  insert into public.bookings (customer_id, venue_id, package_id, event_date, event_time, male_count, female_count, headcount,
                               total_amount, deposit_tier, deposit_amount, contact_name, contact_mobile, contact_email, special_request)
  values (v_cust_a, v_illusion, v_pkg, current_date + 10, '20:00', 10, 10, 20, 29980, '20pct', 5996, 'Throwaway Test', '9876543210',
          'throwaway@example.com', 'THROWAWAY TEST - please ignore')
  returning id into b1;
  r := r || jsonb_build_object('A_booking_ref', (select booking_ref from public.bookings where id = b1),
    'A_log', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'error', error, 'has_request_id', request_id is not null)), '[]') from public.staff_alert_log where booking_id = b1),
    'A_queued_requests_for_staff_alert', (select count(*) from net.http_request_queue where url like '%/send-staff-alert'));

  -- B. no recipient set: the booking must still be saved, the log must say failed
  update public.platform_alert_settings set booking_alert_email = null where id;
  insert into public.bookings (customer_id, venue_id, package_id, event_date, event_time, male_count, female_count, headcount,
                               total_amount, deposit_tier, deposit_amount, contact_name, contact_mobile, contact_email)
  values (v_cust_a, v_illusion, v_pkg, current_date + 11, '20:00', 11, 11, 22, 32978, '20pct', 6596, 'Throwaway Test 2', '9876543210', 'throwaway@example.com')
  returning id into b2;
  r := r || jsonb_build_object('B_booking_saved', exists (select 1 from public.bookings where id = b2),
    'B_log', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'error', error)), '[]') from public.staff_alert_log where booking_id = b2));

  -- C. the alert code itself breaks (the log cannot take a "queued" row): the booking must still be saved
  update public.platform_alert_settings set booking_alert_email = 'paxoapp.in@gmail.com' where id;
  alter table public.staff_alert_log add constraint force_fail check (status <> 'queued') not valid;
  insert into public.bookings (customer_id, venue_id, package_id, event_date, event_time, male_count, female_count, headcount,
                               total_amount, deposit_tier, deposit_amount, contact_name, contact_mobile, contact_email)
  values (v_cust_b, v_illusion, v_pkg, current_date + 12, '20:00', 12, 12, 24, 35976, '20pct', 7195, 'Throwaway Test 3', '9876543210', 'throwaway@example.com')
  returning id into b3;
  r := r || jsonb_build_object('C_booking_saved', exists (select 1 from public.bookings where id = b3),
    'C_log', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'error', left(error, 120))), '[]') from public.staff_alert_log where booking_id = b3));
  alter table public.staff_alert_log drop constraint force_fail;

  -- D. the partner email trigger is untouched
  r := r || jsonb_build_object('partner_email_trigger_still_enabled',
    (select tgenabled from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'trg_send_booking_requested_email'),
    'settings_row', (select to_jsonb(s) - 'updated_at' from public.platform_alert_settings s));

  raise exception 'ROLLBACK-TEST-RESULT %', r::text;   -- on purpose: undoes everything above
end
$outer$;
