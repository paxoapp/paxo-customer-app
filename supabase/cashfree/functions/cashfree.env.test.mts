// Run: node --experimental-strip-types supabase/cashfree/functions/cashfree.env.test.mts   (no network, no secrets)
// Environment independence: a payment is confirmed in the Cashfree environment it was created in, whatever provider / mode is set now.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { confirmOrderAnyEnv, processWebhook, envsPreferring, envFor } from "./cashfree.ts";

const get = (n: string) => ({ CASHFREE_SANDBOX_CLIENT_ID: "sid", CASHFREE_SANDBOX_CLIENT_SECRET: "ssec", CASHFREE_PROD_CLIENT_ID: "pid", CASHFREE_PROD_CLIENT_SECRET: "psec" } as any)[n];
const sb = envFor("sandbox", get)!;
const oid = "PX" + "a".repeat(32);
const success = { cf_payment_id: 9001, payment_status: "SUCCESS", payment_amount: 500, payment_currency: "INR" };
let n = 0; const ok = (m: string) => console.log("PASS", ++n, m);

const both = envsPreferring("sandbox", get);
assert.deepEqual(both.map((e) => e.mode), ["sandbox", "production"]);
assert.deepEqual(envsPreferring("production", get).map((e) => e.mode), ["production", "sandbox"]);
assert.deepEqual(envsPreferring("production", (k) => (k.startsWith("CASHFREE_SANDBOX") ? "x" : undefined)).map((e) => e.mode), ["sandbox"]);
ok("environments: preferred first, only configured ones");

// fake Cashfree with two separate accounts: an order exists in exactly one environment
function world(orderEnv: "sandbox" | "production", orderStatus = "PAID", payments: any[] = [success]) {
  const calls: string[] = []; const rpcCalls: any[] = []; let paid = false;
  const doFetch = (async (url: string) => {
    calls.push(url);
    const here = url.startsWith("https://sandbox.cashfree.com") ? "sandbox" : "production";
    if (here !== orderEnv) return new Response(JSON.stringify({ code: "order_not_found" }), { status: 404 });
    return new Response(JSON.stringify(url.endsWith("/payments") ? payments : { order_status: orderStatus, order_currency: "INR" }), { status: 200 });
  }) as any;
  const events = new Map<string, boolean>();
  const rpc = async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (fn === "cashfree_apply_payment") { const r = paid ? "already paid" : "paid, booking confirmed"; paid = true; return { data: { result: r }, error: null }; }
    if (fn === "cashfree_record_event") { const k = args.p_key; const st = events.has(k) ? (events.get(k) ? "done" : "retry") : "new"; if (!events.has(k)) events.set(k, false); return { data: st, error: null }; }
    if (fn === "cashfree_finish_event") { events.set(args.p_key, true); return { data: null, error: null }; }
    return { data: { result: "x" }, error: null };
  };
  return { doFetch, rpc, calls, rpcCalls };
}
const applies = (w: { rpcCalls: any[] }) => w.rpcCalls.filter((c) => c.fn === "cashfree_apply_payment").length;

// ---- verify (browser-initiated) ----
let w = world("sandbox");
let c = await confirmOrderAnyEnv(envsPreferring("production", get), oid, w.rpc, w.doFetch);
assert.equal(c.status, "paid"); assert.ok(w.calls[0].startsWith("https://api.cashfree.com") && w.calls.some((u) => u.startsWith("https://sandbox.cashfree.com")));
ok("verify: order created in sandbox is still confirmed after the mode was switched to production (production said not found, sandbox answered)");
w = world("production");
c = await confirmOrderAnyEnv(envsPreferring("sandbox", get), oid, w.rpc, w.doFetch);
assert.equal(c.status, "paid"); ok("verify: order created in production is still confirmed when the stored mode says sandbox");
w = world("production");
c = await confirmOrderAnyEnv(envsPreferring("production", get), oid, w.rpc, w.doFetch);
assert.equal(c.status, "paid"); assert.ok(w.calls.every((u) => u.startsWith("https://api.cashfree.com"))); ok("verify: normal case asks only the current environment");
c = await confirmOrderAnyEnv(envsPreferring("production", get), oid, world("sandbox").rpc, (async () => new Response("{}", { status: 404 })) as any);
assert.equal(c.status, "error"); assert.equal((c as any).notFound, true); ok("verify: not in any environment -> error (never reported as not paid)");
w = world("sandbox", "ACTIVE", [{ cf_payment_id: 1, payment_status: "FAILED", payment_amount: 500 }]);
c = await confirmOrderAnyEnv(envsPreferring("sandbox", get), oid, w.rpc, w.doFetch);
assert.equal(c.status, "not_paid"); assert.equal(applies(w), 0); ok("verify: failed payment changes nothing");
c = await confirmOrderAnyEnv([], oid, w.rpc, w.doFetch);
assert.equal(c.status, "error"); ok("verify: no keys configured -> error");

// ---- webhook ----
const evBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", event_time: "2026-11-07T07:00:00+05:30", data: { order: { order_id: oid, order_amount: 500 }, payment: { cf_payment_id: 9001 } } });
const ts = "1760000000123";
const signedBy = (secret: string, b = evBody) => createHmac("sha256", secret).update(ts + b).digest("base64");

let ww = world("sandbox");
let wr = await processWebhook({ raw: evBody, ts, sig: signedBy("ssec"), envs: envsPreferring("production", get), rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.equal(applies(ww), 1); assert.ok(ww.calls.every((u) => u.startsWith("https://sandbox.cashfree.com")));
ok("webhook: sandbox-signed event is confirmed in SANDBOX even though the stored mode is production");
ww = world("production");
wr = await processWebhook({ raw: evBody, ts, sig: signedBy("psec"), envs: envsPreferring("sandbox", get), rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.equal(applies(ww), 1); assert.ok(ww.calls.every((u) => u.startsWith("https://api.cashfree.com")));
ok("webhook: production-signed event is confirmed in PRODUCTION even though the stored mode says sandbox (provider is not consulted at all)");
ww = world("production");
wr = await processWebhook({ raw: evBody, ts, sig: "AAAA", envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 401); assert.equal(ww.rpcCalls.length, 0); assert.equal(ww.calls.length, 0); ok("webhook: bad signature -> 401, nothing touched");
wr = await processWebhook({ raw: evBody, ts: null, sig: null, envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 401); ok("webhook: missing headers -> 401");
wr = await processWebhook({ raw: evBody + " ", ts, sig: signedBy("psec"), envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 401); ok("webhook: body altered after signing -> 401");
wr = await processWebhook({ raw: evBody, ts, sig: signedBy("psec"), envs: [sb], rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 401); ok("webhook: production-signed event while no production key is set -> 401");

ww = world("sandbox");
const sigS = signedBy("ssec");
await processWebhook({ raw: evBody, ts, sig: sigS, envs: both, rpc: ww.rpc }, ww.doFetch);
wr = await processWebhook({ raw: evBody, ts, sig: sigS, envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.equal(wr.text, "ok (already processed)"); assert.equal(applies(ww), 1);
ok("webhook: same event twice -> second is acknowledged and does nothing");

ww = world("production");
wr = await processWebhook({ raw: evBody, ts, sig: signedBy("ssec"), envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.equal(applies(ww), 0); ok("webhook: a sandbox-signed event cannot confirm an order that belongs to production (200, ignored, nothing applied)");

ww = world("sandbox");
wr = await processWebhook({ raw: evBody, ts, sig: sigS, envs: both, rpc: ww.rpc }, (async () => new Response("{}", { status: 500 })) as any);
assert.equal(wr.status, 500); ok("webhook: Cashfree unreachable -> 500 so Cashfree retries");

const ping = JSON.stringify({ type: "WEBHOOK", data: { test_object: { text: "hello" } } });
ww = world("sandbox");
wr = await processWebhook({ raw: ping, ts, sig: signedBy("ssec", ping), envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.equal(ww.calls.length, 0); ok("webhook: Cashfree test ping -> 200, ignored, no Cashfree call");

for (const t of ["PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"]) {
  const b = JSON.stringify({ type: t, event_time: "e" + t, data: { order: { order_id: oid }, payment: { cf_payment_id: 5 } } });
  ww = world("sandbox", "ACTIVE", [{ cf_payment_id: 5, payment_status: t.includes("FAILED") ? "FAILED" : "USER_DROPPED", payment_amount: 500 }]);
  wr = await processWebhook({ raw: b, ts, sig: signedBy("ssec", b), envs: both, rpc: ww.rpc }, ww.doFetch);
  assert.equal(wr.status, 200); assert.equal(applies(ww), 0);
}
ok("webhook: failed and user-dropped events change nothing");

const ch = JSON.stringify({ type: "PAYMENT_CHARGES_WEBHOOK", event_time: "c1", data: { order: { order_id: oid }, payment: { cf_payment_id: 9001 }, charges_details: { service_charge: 8.5, service_tax: 1.53 } } });
ww = world("sandbox");
wr = await processWebhook({ raw: ch, ts, sig: signedBy("ssec", ch), envs: both, rpc: ww.rpc }, ww.doFetch);
assert.equal(wr.status, 200); assert.deepEqual(ww.rpcCalls.find((x) => x.fn === "cashfree_apply_charges")?.args, { p_order_id: oid, p_service_charge: 8.5, p_service_tax: 1.53 });
ok("webhook: charges event passes the real fee to the database");
console.log(`\nall ${n} environment checks passed`);
