// send-staff-alert  (verify_jwt = false: it is called by the database trigger and checks the shared webhook secret itself,
// exactly like send-transactional-email). Sends ONE internal email to PAXO staff about a new booking request.
// The recipient is read here from platform_alert_settings.booking_alert_email (never taken from the request), so this function
// cannot be used to mail anybody else. After the send it writes the result into staff_alert_log (sent / failed + error).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "PAXO <hello@mypaxo.in>";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function oneLine(v: unknown): string {
  return String(v ?? "").replace(/[\r\n]+/g, " ").trim();
}
function prettyDate(v: unknown): string {
  const s = String(v ?? "");
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00Z") : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : s;
}
function prettyTime(v: unknown): string {
  const m = /^(\d{2}):(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1]}:${m[2]}` : String(v ?? "");
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

async function logResult(logId: string | null, status: "sent" | "failed", error: string | null) {
  if (!logId) return;
  try {
    await rest(`staff_alert_log?id=eq.${logId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status, error: error ? error.slice(0, 500) : null, updated_at: new Date().toISOString() }),
    });
  } catch (_e) { /* best effort */ }
}

function buildEmail(b: Record<string, unknown>) {
  const venue = oneLine(b.venue_name) || "a venue";
  const date = prettyDate(b.event_date);
  const guests = Number(b.headcount) || 0;
  const subject = `New booking request: ${venue}, ${date}, ${guests} guests`;

  const split = [
    Number(b.male_count) > 0 ? `${Number(b.male_count)} male` : "",
    Number(b.female_count) > 0 ? `${Number(b.female_count)} female` : "",
  ].filter(Boolean).join(", ");
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eee6e1;color:#6b5b55;width:38%;vertical-align:top;">${label}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #eee6e1;color:#170D0B;font-weight:600;vertical-align:top;">${value}</td></tr>`;
  const dash = "—";
  const table =
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:13px;border-collapse:collapse;">` +
    row("Booking reference", esc(b.booking_ref) || dash) +
    row("Venue", esc(b.venue_name) || dash) +
    row("Venue contact phone", esc(b.venue_phone) || dash) +
    row("Package", esc(b.package_name) || dash) +
    row("Event date and time", `${esc(date) || dash}${b.event_time ? ", " + esc(prettyTime(b.event_time)) : ""}`) +
    row("Guests", `${esc(guests || dash)}${split ? " (" + esc(split) + ")" : ""}`) +
    row("Customer name", esc(b.customer_name) || dash) +
    row("Customer phone", esc(b.customer_phone) || dash) +
    row("Customer email", esc(b.customer_email) || dash) +
    row("Special request", esc(b.special_request) || dash) +
    `</table>`;
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ee;padding:32px 0;"><tr><td align="center">` +
    `<table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">` +
    `<tr><td style="background:#170D0B;padding:24px 32px;"><span style="color:#F5A623;font-size:22px;font-weight:800;letter-spacing:0.5px;">PAXO</span>` +
    `<span style="color:#c9b8ae;font-size:12px;margin-left:12px;">internal alert</span></td></tr>` +
    `<tr><td style="padding:32px;"><h1 style="margin:0 0 8px;font-size:20px;color:#170D0B;">New booking request</h1>` +
    `<p style="margin:0;font-size:14px;color:#3a2e2a;">A customer has just sent a request. The venue has been emailed separately.</p>` +
    table +
    `</td></tr><tr><td style="padding:16px 32px;background:#f5f1ee;"><p style="margin:0;font-size:12px;color:#9a8a84;">Internal PAXO alert. Do not forward to customers or venues.</p></td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, html };
}

Deno.serve(async (req: Request) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: { log_id?: string; booking?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const logId = typeof payload.log_id === "string" && UUID_RE.test(payload.log_id) ? payload.log_id : null;
  const booking = payload.booking && typeof payload.booking === "object" ? payload.booking : null;
  if (!booking) { await logResult(logId, "failed", "no booking in the request"); return json({ ok: false, error: "missing booking" }, 400); }

  try {
    if (!RESEND_API_KEY) { await logResult(logId, "failed", "RESEND_API_KEY not configured"); return json({ ok: false, error: "RESEND_API_KEY not configured" }, 500); }

    // The recipient and the on/off switch come from the database, never from the request.
    const sres = await rest("platform_alert_settings?id=eq.true&select=booking_alert_email,enabled");
    const srows = sres.ok ? await sres.json() : [];
    const settings = Array.isArray(srows) ? srows[0] : null;
    if (!settings) { await logResult(logId, "failed", "could not read platform_alert_settings"); return json({ ok: false, error: "settings unreadable" }, 500); }
    if (!settings.enabled) { await logResult(logId, "failed", "alerts were switched off before sending"); return json({ ok: true, skipped: true }); }
    const to = String(settings.booking_alert_email ?? "").trim();
    if (!to) { await logResult(logId, "failed", "no booking_alert_email set"); return json({ ok: false, error: "no recipient" }, 500); }

    const { subject, html } = buildEmail(booking);
    const bookingId = typeof booking.id === "string" && UUID_RE.test(booking.id) ? booking.id : null;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(bookingId ? { "Idempotency-Key": `staff-alert-${bookingId}` } : {}),
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    const body = await res.text();
    if (res.ok) { await logResult(logId, "sent", null); return json({ ok: true, status: res.status }); }
    await logResult(logId, "failed", `Resend ${res.status}: ${body}`);
    return json({ ok: false, status: res.status }, 502);
  } catch (err) {
    await logResult(logId, "failed", `function error: ${String(err)}`);
    return json({ ok: false, error: "internal error" }, 500);
  }
});
