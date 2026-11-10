// Run: node --experimental-strip-types supabase/cashfree/functions/cashfree.test.mts   (no network, no secrets)
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { sign, verifyWebhook, safeEqual, confirmOrder, envFor, ORDER_ID_RE, API_VERSION } from "./cashfree.ts";

const secret = "test_secret_value";
const body = '{"data":{"order":{"order_id":"PX' + "a".repeat(32) + '","order_amount":500}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
const ts = "1760000000000";
let n = 0; const ok = (m: string) => console.log("PASS", ++n, m);

// signature equals an independent implementation (node crypto) of Base64(HMAC-SHA256(ts + rawBody))
const ref = createHmac("sha256", secret).update(ts + body).digest("base64");
assert.equal(await sign(secret, ts, body), ref); ok("signature matches independent HMAC of timestamp+rawBody");
assert.equal(await verifyWebhook(body, ts, ref, secret), true); ok("valid signature accepted");
assert.equal(await verifyWebhook(body + " ", ts, ref, secret), false); ok("body changed by one byte -> rejected");
assert.equal(await verifyWebhook(body, "1760000000001", ref, secret), false); ok("timestamp changed -> rejected");
assert.equal(await verifyWebhook(body, ts, ref, "other_secret"), false); ok("wrong secret -> rejected");
assert.equal(await verifyWebhook(body, null, ref, secret), false); ok("missing timestamp -> rejected");
assert.equal(await verifyWebhook(body, ts, null, secret), false); ok("missing signature -> rejected");
assert.equal(safeEqual("abc", "abc"), true); assert.equal(safeEqual("abc", "abd"), false); assert.equal(safeEqual("abc", "abcd"), false); ok("safeEqual");

assert.equal(envFor("sandbox", () => undefined), null); ok("no keys -> null (function answers 503)");
const get = (n: string) => ({ CASHFREE_SANDBOX_CLIENT_ID: "sid", CASHFREE_SANDBOX_CLIENT_SECRET: "ssec", CASHFREE_PROD_CLIENT_ID: "pid", CASHFREE_PROD_CLIENT_SECRET: "psec" } as any)[n];
const sb = envFor("sandbox", get)!, pr = envFor("production", get)!;
assert.equal(sb.base, "https://sandbox.cashfree.com/pg"); assert.equal(pr.base, "https://api.cashfree.com/pg");
assert.equal(sb.clientSecret, "ssec"); assert.equal(pr.clientSecret, "psec"); ok("sandbox and production use their own base URL and keys");

const oid = "PX" + "a".repeat(32);
assert.ok(ORDER_ID_RE.test(oid)); assert.ok(!ORDER_ID_RE.test("order_123")); assert.ok(!ORDER_ID_RE.test("PX" + "g".repeat(32))); ok("only PAXO order ids are handled");

// fake Cashfree + fake database
function world(orderStatus: string, payments: any[], httpOrder = 200, httpPay = 200) {
  const calls: any[] = []; const rpcCalls: any[] = [];
  const doFetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers });
    const isPay = url.endsWith("/payments");
    const status = isPay ? httpPay : httpOrder;
    const data = isPay ? payments : { order_status: orderStatus, order_currency: "INR" };
    return new Response(JSON.stringify(data), { status });
  }) as any;
  let paid = false;
  const rpc = async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (fn !== "cashfree_apply_payment") return { data: null, error: null };
    const r = paid ? "already paid" : "paid, booking confirmed"; paid = true; // the real function is idempotent the same way
    return { data: { result: r }, error: null };
  };
  return { doFetch, rpc, calls, rpcCalls };
}
const success = { cf_payment_id: 9001, payment_status: "SUCCESS", payment_amount: 500, payment_currency: "INR" };

let w = world("PAID", [success]);
let r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.deepEqual(r, { status: "paid", result: "paid, booking confirmed" });
assert.equal(w.calls[0].headers["x-api-version"], API_VERSION); assert.equal(w.calls[0].headers["x-client-id"], "sid");
assert.deepEqual(w.rpcCalls[0].args, { p_order_id: oid, p_cf_payment_id: "9001", p_amount: 500, p_currency: "INR" });
ok("PAID + SUCCESS: asks Cashfree (version header, keys), passes Cashfree's amount and payment id to the database");
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.deepEqual(r, { status: "paid", result: "already paid" }); ok("confirming twice (webhook + browser) is safe");

w = world("ACTIVE", [{ cf_payment_id: 1, payment_status: "FAILED", payment_amount: 500 }]);
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.deepEqual(r, { status: "not_paid", order_status: "ACTIVE" }); assert.equal(w.rpcCalls.length, 0); ok("failed payment: database never called");
w = world("ACTIVE", [{ cf_payment_id: 1, payment_status: "USER_DROPPED", payment_amount: 500 }]);
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.equal(r.status, "not_paid"); assert.equal(w.rpcCalls.length, 0); ok("abandoned payment: database never called");
w = world("EXPIRED", []);
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.equal(r.status, "not_paid"); assert.equal(w.rpcCalls.length, 0); ok("expired order with no payment: nothing changes");
w = world("ACTIVE", [{ cf_payment_id: 1, payment_status: "PENDING", payment_amount: 500 }]);
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.equal(r.status, "pending"); assert.equal(w.rpcCalls.length, 0); ok("pending payment: reported as pending, nothing changes");
w = world("ACTIVE", [success]); // a SUCCESS payment but the order is not PAID: not trusted
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.notEqual(r.status, "paid"); assert.equal(w.rpcCalls.length, 0); ok("a SUCCESS row on an order that Cashfree does not call PAID is not trusted");
w = world("PAID", [success], 500);
r = await confirmOrder(sb, oid, w.rpc, w.doFetch);
assert.equal(r.status, "error"); assert.equal(w.rpcCalls.length, 0); ok("Cashfree down: reported as error (webhook answers 500 so Cashfree retries), nothing changes");
w = world("PAID", [success]);
r = await confirmOrder(sb, "order_123", w.rpc, w.doFetch);
assert.equal(r.status, "error"); assert.equal(w.calls.length, 0); ok("a non-PAXO order id never reaches Cashfree or the database");
console.log(`\nall ${n} checks passed`);
