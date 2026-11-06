// cashfree-webhook  (verify_jwt = false; Cashfree cannot send a Supabase token) — deployed as index.ts together with cashfree.ts
// NOT DEPLOYED until the founder says so.
//  1. Reads the RAW body, checks x-webhook-signature (Base64 HMAC-SHA256 of timestamp+rawBody with the client secret).
//     The secret tried is the one for the current mode first, then the other (a sandbox test while production is set, or vice versa, is
//     answered with 200 but ignored: the order lookup in confirmOrder uses the matching environment only).
//  2. Dedupes by event key (cashfree_events), so receiving the same event twice is harmless.
//  3. Never trusts the body for money: for a payment event it asks Cashfree for the order status itself (confirmOrder).
//  4. Always answers 200 for a validly signed event (Cashfree retries anything else). Bad signature = 401.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envFor, confirmOrder, verifyWebhook, sha256Hex, ORDER_ID_RE, type Mode } from "./cashfree.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const text = (s: string, status = 200) => new Response(s, { status });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return text("method not allowed", 405);
  const raw = await req.text(); // raw body, exactly as sent
  const ts = req.headers.get("x-webhook-timestamp");
  const sig = req.headers.get("x-webhook-signature");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: prov } = await supabase.rpc("get_payment_provider");
  const current: Mode = prov?.mode === "production" ? "production" : "sandbox";
  const other: Mode = current === "sandbox" ? "production" : "sandbox";

  let matched: Mode | null = null;
  for (const m of [current, other]) {
    const env = envFor(m, (n) => Deno.env.get(n));
    if (env && (await verifyWebhook(raw, ts, sig, env.clientSecret))) { matched = m; break; }
  }
  if (!matched) return text("invalid signature", 401);
  if (matched !== current) return text("ok (other environment, ignored)"); // signed, but not for the mode PAXO is running

  let body: any;
  try { body = JSON.parse(raw); } catch { return text("ok (not json)"); }
  const type = String(body?.type ?? "");
  const orderId = String(body?.data?.order?.order_id ?? "");
  const cfPaymentId = String(body?.data?.payment?.cf_payment_id ?? body?.data?.refund?.cf_payment_id ?? "");
  // Same event delivered twice has the same type + order + payment id (+ Cashfree's own event time when present).
  const eventKey = await sha256Hex([type, orderId, cfPaymentId, String(body?.event_time ?? ""), ts && !orderId ? ts : ""].join("|"));

  const { data: state, error: recErr } = await supabase.rpc("cashfree_record_event", { p_key: eventKey, p_type: type, p_payload: body });
  if (recErr) { console.error("cashfree_record_event", recErr.message); return text("retry", 500); } // let Cashfree retry
  if (state === "done") return text("ok (already processed)");

  let result = "ignored";
  try {
    const env = envFor(current, (n) => Deno.env.get(n))!;
    if (!ORDER_ID_RE.test(orderId)) {
      result = "ignored: not a PAXO order"; // e.g. a test ping or an order from another system on the same account
    } else if (type === "PAYMENT_SUCCESS_WEBHOOK" || type === "PAYMENT_FAILED_WEBHOOK" || type === "PAYMENT_USER_DROPPED_WEBHOOK") {
      // The body is only a hint to go and look. Failed/dropped payments change nothing in the booking: the order stays open for a retry.
      const r = await confirmOrder(env, orderId, (fn, args) => supabase.rpc(fn, args) as any);
      if (r.status === "error") { console.error("cashfree-webhook confirm", r.message); return text("retry", 500); }
      result = r.status === "paid" ? `paid: ${r.result}` : r.status === "pending" ? "pending" : `not paid: ${r.order_status}`;
    } else if (type === "PAYMENT_CHARGES_WEBHOOK") {
      const sc = Number(body?.data?.charges_details?.service_charge), st = Number(body?.data?.charges_details?.service_tax);
      const { data } = await supabase.rpc("cashfree_apply_charges", { p_order_id: orderId, p_service_charge: sc, p_service_tax: st });
      result = `charges: ${data?.result ?? "?"}`;
    } else {
      result = `ignored: ${type || "no type"}`; // refunds are manual at launch; refund status events are only logged
    }
  } catch (e) {
    console.error("cashfree-webhook", String(e));
    return text("retry", 500);
  }
  await supabase.rpc("cashfree_finish_event", { p_key: eventKey, p_result: result });
  return text("ok");
});
