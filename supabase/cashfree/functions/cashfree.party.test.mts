// Run: node --experimental-strip-types supabase/cashfree/functions/cashfree.party.test.mts   (no network, no secrets)
// Party Pool orders (PY...) share the one webhook URL with booking orders (PX...) but use their own database functions.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { confirmOrder, processWebhook, envFor, isPaxoOrder, ORDER_ID_RE, PARTY_ORDER_ID_RE } from "./cashfree.ts";

const get = (n: string) => ({ CASHFREE_PROD_CLIENT_ID: "pid", CASHFREE_PROD_CLIENT_SECRET: "psec" } as any)[n];
const pr = envFor("production", get)!;
const px = "PX" + "a".repeat(32), py = "PY" + "b".repeat(32);
let n = 0; const ok = (m: string) => console.log("PASS", ++n, m);

assert.ok(PARTY_ORDER_ID_RE.test(py) && !ORDER_ID_RE.test(py) && ORDER_ID_RE.test(px) && !PARTY_ORDER_ID_RE.test(px));
assert.ok(isPaxoOrder(px) && isPaxoOrder(py) && !isPaxoOrder("PZ" + "a".repeat(32)) && !isPaxoOrder("order_1") && !isPaxoOrder(py + "x"));
ok("PX = booking, PY = party, anything else is not ours");

function world(payAmount = 60) {
  const calls: string[] = []; const rpcCalls: any[] = []; const events = new Map<string, boolean>();
  const doFetch = (async (url: string) => {
    calls.push(url);
    const data = url.endsWith("/payments") ? [{ cf_payment_id: 777, payment_status: "SUCCESS", payment_amount: payAmount, payment_currency: "INR" }] : { order_status: "PAID", order_currency: "INR" };
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
  const rpc = async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (fn === "cashfree_record_event") { const k = args.p_key; const st = events.has(k) ? (events.get(k) ? "done" : "retry") : "new"; if (!events.has(k)) events.set(k, false); return { data: st, error: null }; }
    if (fn === "cashfree_finish_event") { events.set(args.p_key, true); return { data: null, error: null }; }
    if (fn.endsWith("apply_payment")) return { data: { result: "paid" }, error: null };
    return { data: { result: "fee stored" }, error: null };
  };
  return { doFetch, rpc, calls, rpcCalls };
}
const applied = (w: { rpcCalls: any[] }) => w.rpcCalls.filter((c) => c.fn.endsWith("apply_payment")).map((c) => c.fn);

let w = world();
let c = await confirmOrder(pr, py, w.rpc, w.doFetch);
assert.equal(c.status, "paid"); assert.deepEqual(applied(w), ["party_cashfree_apply_payment"]);
assert.deepEqual(w.rpcCalls.find((x) => x.fn === "party_cashfree_apply_payment").args, { p_order_id: py, p_cf_payment_id: "777", p_amount: 60, p_currency: "INR" });
ok("a party order is recorded through party_cashfree_apply_payment only, with Cashfree's amount");
w = world();
c = await confirmOrder(pr, px, w.rpc, w.doFetch);
assert.equal(c.status, "paid"); assert.deepEqual(applied(w), ["cashfree_apply_payment"]); ok("a booking order still goes through cashfree_apply_payment only (unchanged)");
w = world();
c = await confirmOrder(pr, "PZ" + "a".repeat(32), w.rpc, w.doFetch);
assert.equal(c.status, "error"); assert.equal(w.calls.length, 0); ok("a foreign order id never reaches Cashfree or the database");

// webhook
const sign = (raw: string, ts: string) => createHmac("sha256", "psec").update(ts + raw).digest("base64");
async function hook(type: string, orderId: string, w: any, extra: any = {}) {
  const raw = JSON.stringify({ type, event_time: "2026-11-10T12:00:00+05:30", data: { order: { order_id: orderId, order_amount: 60 }, payment: { cf_payment_id: 777 }, ...extra } });
  const ts = "1762000000000";
  return processWebhook({ raw, ts, sig: sign(raw, ts), envs: [pr], rpc: w.rpc }, w.doFetch);
}
w = world();
let r = await hook("PAYMENT_SUCCESS_WEBHOOK", py, w);
assert.equal(r.status, 200); assert.deepEqual(applied(w), ["party_cashfree_apply_payment"]); ok("webhook: party payment success -> party function");
r = await hook("PAYMENT_SUCCESS_WEBHOOK", py, w);
assert.equal(r.status, 200); assert.equal(applied(w).length, 1); assert.match(r.text, /already processed/); ok("webhook: the same event twice is applied once");
w = world();
r = await hook("PAYMENT_SUCCESS_WEBHOOK", px, w);
assert.deepEqual(applied(w), ["cashfree_apply_payment"]); ok("webhook: booking payment success -> booking function (unchanged)");
w = world();
await hook("PAYMENT_CHARGES_WEBHOOK", py, w, { charges_details: { service_charge: 1.42, service_tax: 0.26 } });
let ch = w.rpcCalls.find((x) => x.fn.includes("apply_charges"));
assert.equal(ch.fn, "party_cashfree_apply_charges"); assert.deepEqual(ch.args, { p_order_id: py, p_service_charge: 1.42, p_service_tax: 0.26 }); ok("webhook: party charges -> party_cashfree_apply_charges");
w = world();
await hook("PAYMENT_CHARGES_WEBHOOK", px, w, { charges_details: { service_charge: 1.42, service_tax: 0.26 } });
assert.equal(w.rpcCalls.find((x) => x.fn.includes("apply_charges")).fn, "cashfree_apply_charges"); ok("webhook: booking charges -> cashfree_apply_charges (unchanged)");
w = world();
r = await hook("PAYMENT_SUCCESS_WEBHOOK", "PZ" + "c".repeat(32), w);
assert.equal(r.status, 200); assert.equal(applied(w).length, 0); assert.equal(w.calls.length, 0); ok("webhook: someone else's order in the same Cashfree account is ignored");
w = world();
const raw = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: py } } });
r = await processWebhook({ raw, ts: "1", sig: "bad", envs: [pr], rpc: w.rpc }, w.doFetch);
assert.equal(r.status, 401); assert.equal(w.rpcCalls.length, 0); ok("webhook: bad signature -> 401, nothing touched");
console.log(`\nall ${n} party checks passed`);
