-- booking-alert: tell PAXO staff when a customer submits a booking request.
-- Adds a SECOND, separate alert next to the existing partner email (trg_send_booking_requested_email is NOT touched).
-- Nothing here changes what customers or venues see. A failed alert can never block or roll back a booking.

-- 1. Where the alert goes: ONE row. Change the recipient here, nowhere else.
create table public.platform_alert_settings (
  id                     boolean primary key default true check (id),   -- check (id) = only one row can exist
  booking_alert_email    text,
  booking_alert_whatsapp text,                                          -- prepared, not used yet (no WhatsApp calls)
  enabled                boolean not null default true,
  updated_at             timestamptz not null default now()
);
alter table public.platform_alert_settings enable row level security;   -- no policies: only the database functions / service role read it
revoke all on public.platform_alert_settings from anon, authenticated;
insert into public.platform_alert_settings (id, booking_alert_email, booking_alert_whatsapp, enabled)
values (true, 'paxoapp.in@gmail.com', null, true);

-- 2. One row per alert attempt, so a failed alert is visible.
--    status: queued = handed to the email function, sent / failed = its answer, skipped = deliberately not sent.
create table public.staff_alert_log (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  channel    text not null check (channel in ('email', 'whatsapp')),
  status     text not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  error      text,
  request_id bigint,                                                     -- pg_net request id (look it up in net._http_response if the function never answered)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_alert_log_booking_idx on public.staff_alert_log (booking_id);
create index staff_alert_log_created_idx on public.staff_alert_log (created_at desc);
alter table public.staff_alert_log enable row level security;           -- no policies: service role / database functions only
revoke all on public.staff_alert_log from anon, authenticated;

-- 3. The trigger function. SECURITY DEFINER, fixed search_path. The webhook secret is read from the vault ('webhook_secret'),
--    the same place party_email() reads it; it is not written into this file.
--    Everything is inside one exception block: any error is logged (best effort) and swallowed, the booking carries on.
create or replace function public.staff_alert_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $fn$
declare
  s       public.platform_alert_settings%rowtype;
  v_secret text;
  v_venue  text;
  v_phone  text;
  v_pkg    text;
  v_log    uuid;
  v_req    bigint;
begin
  begin
    select * into s from public.platform_alert_settings where id;
    if not found or not s.enabled then
      return new;                                                     -- alerts switched off: nothing to do, nothing logged
    end if;

    -- WhatsApp: prepared only. s.booking_alert_whatsapp is stored but no WhatsApp call is made anywhere.

    if coalesce(btrim(s.booking_alert_email), '') = '' then
      insert into public.staff_alert_log (booking_id, channel, status, error)
      values (new.id, 'email', 'failed', 'no booking_alert_email set in platform_alert_settings');
      return new;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';
    if v_secret is null then
      insert into public.staff_alert_log (booking_id, channel, status, error)
      values (new.id, 'email', 'failed', 'webhook_secret not found in the vault');
      return new;
    end if;

    select name, contact_phone into v_venue, v_phone from public.venues where id = new.venue_id;
    select name into v_pkg from public.venue_packages where id = new.package_id;

    insert into public.staff_alert_log (booking_id, channel, status)
    values (new.id, 'email', 'queued') returning id into v_log;

    -- net.http_post only queues the request (it never waits for, or fails because of, the email service).
    -- The recipient is NOT sent: the email function reads it from platform_alert_settings itself.
    v_req := net.http_post(
      url     := 'https://cjjksssylejwxwbalury.supabase.co/functions/v1/send-staff-alert',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body    := jsonb_build_object(
        'log_id', v_log,
        'booking', jsonb_build_object(
          'id',               new.id,
          'booking_ref',      new.booking_ref,
          'venue_name',       v_venue,
          'venue_phone',      v_phone,
          'package_name',     v_pkg,
          'event_date',       new.event_date,
          'event_time',       new.event_time,
          'headcount',        new.headcount,
          'male_count',       new.male_count,
          'female_count',     new.female_count,
          'customer_name',    new.contact_name,
          'customer_phone',   new.contact_mobile,
          'customer_email',   new.contact_email,
          'special_request',  new.special_request
        )
      )
    );
    update public.staff_alert_log set request_id = v_req, updated_at = now() where id = v_log;

  exception when others then
    -- never block or roll back the customer's booking
    begin
      insert into public.staff_alert_log (booking_id, channel, status, error)
      values (new.id, 'email', 'failed', left('trigger error: ' || sqlerrm, 500));
    exception when others then
      null;
    end;
  end;
  return new;
end;
$fn$;

revoke all on function public.staff_alert_new_booking() from public, anon, authenticated;

create trigger trg_staff_alert_new_booking
  after insert on public.bookings
  for each row execute function public.staff_alert_new_booking();
