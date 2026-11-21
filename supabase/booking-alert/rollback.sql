-- Undo booking-alert completely. The partner email trigger is not involved.
drop trigger if exists trg_staff_alert_new_booking on public.bookings;
drop function if exists public.staff_alert_new_booking();
drop table if exists public.staff_alert_log;
drop table if exists public.platform_alert_settings;
