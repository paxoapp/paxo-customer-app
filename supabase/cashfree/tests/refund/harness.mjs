// node --experimental-strip-types supabase/cashfree/tests/refund/harness.mjs   (writes run-*.ts next to it; delete them afterwards)
// Runs the ORIGINAL (deployed) process-booking-refund and the PATCHED one against the same mocked database and mocked Razorpay,
// and compares every database write, every outgoing HTTP call and the response.
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = fileURLToPath(new URL(".", import.meta.url)).replaceAll("\\", "/");

let log = []; let scenario = null;
globalThis.__mock = {
  createClient(url, key) {
    const isCaller = key === "anon";
    const from = (table) => {
      const q = { table, op: "select", v: null,
        select() { return q; }, eq() { return q; },
        update(v) { q.op = "update"; q.v = v; return q; },
        insert(v) { log.push({ table, op: "insert", v }); return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve(res()); },
        then(ok, bad) { return Promise.resolve(res()).then(ok, bad); } };
      function res() {
        if (q.op === "update") { log.push({ table, op: "update", v: q.v }); return { data: null, error: null }; }
        if (table === "bookings") return { data: scenario.booking, error: null };
        if (table === "admin_users") return { data: scenario.isAdmin ? { id: "a" } : null, error: null };
        if (table === "payments") return scenario.payment ? { data: scenario.payment, error: null } : { data: null, error: { message: "none" } };
        return { data: null, error: null };
      }
      return q;
    };
    return {
      from,
      rpc: async (fn) => ({ data: scenario.quote, error: null }),
      auth: { getUser: async () => ({ data: { user: { id: scenario.uid } } }) },
    };
  },
};
const envs = { RAZORPAY_KEY_ID: "rzp_id", RAZORPAY_KEY_SECRET: "rzp_sec", SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

async function load(file) {
  let src = fs.readFileSync(dir + file, "utf8").replace('import { createClient } from "jsr:@supabase/supabase-js@2";', "const createClient = (...a) => globalThis.__mock.createClient(...a);");
  const out = dir + "run-" + file;
  fs.writeFileSync(out, src);
  let handler;
  globalThis.Deno = { env: { get: (k) => envs[k] }, serve: (h) => { handler = h; } };
  await import(pathToFileURL(out).href + "?" + Math.random());
  return handler;
}
const norm = (x) => JSON.parse(JSON.stringify(x).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<TS>"));

async function run(handler, sc, body) {
  scenario = sc; log = []; const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization }); return new Response(JSON.stringify(sc.rzp.body), { status: sc.rzp.status }); };
  const r = await handler(new Request("http://x", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify(body) }));
  return norm({ status: r.status, body: await r.json(), writes: log, http: calls });
}

const quote = (o = {}) => ({ can_cancel: true, refund_amount: 11590.11, refund_percent: 100, forfeited_amount: 0, gateway_fee_deducted: 280.14, fee_is_estimate: true, ...o });
const booking = { id: "b1", customer_id: "u1", venue_id: "v1", status: "confirmed" };
const rzPay = { id: "p1", provider: "razorpay", razorpay_payment_id: "pay_RZ1", cashfree_payment_id: null, cashfree_order_id: null };
const cfPay = { id: "p2", provider: "cashfree", razorpay_payment_id: null, cashfree_payment_id: "1472489289245379584", cashfree_order_id: "PXabc" };
const base = { booking, uid: "u1", isAdmin: false, quote: quote(), rzp: { status: 200, body: { id: "rfnd_1" } } };
const oldRzPay = { id: "p1", razorpay_payment_id: "pay_RZ1" }; // a row from before the migration has no provider key at all in this mock; in the database it reads 'razorpay'
const body = { booking_id: "b1", initiated_by: "customer", cancellation_reason: "plans changed", expected_refund_amount: 11590.11 };

const razorpayScenarios = {
  "razorpay: refund processed": { ...base, payment: rzPay },
  "razorpay: refund processed (row without provider value)": { ...base, payment: oldRzPay },
  "razorpay: low balance -> pending + retry + alert": { ...base, payment: rzPay, rzp: { status: 400, body: { error: { description: "Your account does not have enough balance" } } } },
  "razorpay: other gateway failure -> 502, nothing changed": { ...base, payment: rzPay, rzp: { status: 400, body: { error: { description: "Bad request" } } } },
  "razorpay: no payment id -> 500": { ...base, payment: { ...rzPay, razorpay_payment_id: null } },
  "razorpay: refund 0 (late booking) -> cancelled, no gateway call": { ...base, payment: rzPay, quote: quote({ refund_amount: 0, refund_percent: 0, forfeited_amount: 11870.25, gateway_fee_deducted: 0 }) },
  "razorpay: no paid deposit -> 404": { ...base, payment: null },
  "razorpay: stale expected amount -> 409": { ...base, payment: rzPay, quote: quote({ refund_amount: 5000 }) },
  "razorpay: not the customer -> 403": { ...base, payment: rzPay, uid: "other" },
};

const original = await load("deployed-original.ts");
const patched = await load("patched.ts");
let n = 0;
for (const [name, sc] of Object.entries(razorpayScenarios)) {
  const bd = sc.quote.refund_amount === 0 ? { ...body, expected_refund_amount: 0 } : body;
  const a = await run(original, sc, bd), b = await run(patched, sc, bd);
  assert.deepEqual(b, a, name);
  console.log("PASS identical to deployed:", name, "-> HTTP", a.status, "| writes:", a.writes.length, "| gateway calls:", a.http.length);
  n++;
}
const adminBody = { booking_id: "b1", initiated_by: "admin", cancellation_reason: "venue closed" };
{
  const sc = { ...base, payment: rzPay, isAdmin: true, uid: "adm" };
  const a = await run(original, sc, adminBody), b = await run(patched, sc, adminBody);
  assert.deepEqual(b, a); console.log("PASS identical to deployed: razorpay: admin-initiated cancel -> HTTP", a.status); n++;
}

// Cashfree scenarios (behaviour that is NEW)
const before = await run(original, { ...base, payment: cfPay }, body);
console.log("\nFor contrast, DEPLOYED function on a Cashfree-paid booking:", before.status, JSON.stringify(before.body), "| writes:", before.writes.length);
const cf = await run(patched, { ...base, payment: cfPay }, body);
assert.equal(cf.status, 200); assert.equal(cf.body.ok, true); assert.equal(cf.body.refund_status, "pending"); assert.equal(cf.http.length, 0);
const pu = cf.writes.find((w) => w.table === "payments" && w.op === "update").v;
assert.equal(pu.refund_status, "pending"); assert.equal(pu.refund_next_retry_at, null); assert.equal(pu.refund_attempts, 0); assert.equal(pu.razorpay_refund_id, null); assert.equal(pu.refund_amount, 11590.11);
const bu = cf.writes.find((w) => w.table === "bookings" && w.op === "update").v; assert.equal(bu.status, "cancelled");
const al = cf.writes.find((w) => w.table === "admin_alerts").v;
assert.equal(al.urgent, true); assert.equal(al.kind, "refund_pending"); assert.ok(al.message.includes("1472489289245379584")); assert.ok(al.message.includes("PXabc"));
console.log("PASS cashfree: HTTP 200, booking cancelled, refund pending, no retry time, no call to any gateway, urgent alert with payment id");
console.log("     alert text:", al.message); n++;
const cf0 = await run(patched, { ...base, payment: cfPay, quote: quote({ refund_amount: 0, refund_percent: 0, forfeited_amount: 11870.25, gateway_fee_deducted: 0 }) }, { ...body, expected_refund_amount: 0 });
assert.equal(cf0.status, 200); assert.equal(cf0.body.refund_status, "processed"); assert.equal(cf0.http.length, 0); assert.equal(cf0.writes.filter((w) => w.table === "admin_alerts").length, 0);
console.log("PASS cashfree: refund 0 (non-refundable) -> cancelled, nothing pending, no alert"); n++;
const cfNo = await run(patched, { ...base, payment: { ...cfPay, cashfree_payment_id: null } }, body);
assert.equal(cfNo.status, 500); assert.equal(cfNo.writes.length, 0);
console.log("PASS cashfree: payment without a Cashfree payment id -> 500, nothing changed"); n++;
const cfStale = await run(patched, { ...base, payment: cfPay, quote: quote({ refund_amount: 5000 }) }, body);
assert.equal(cfStale.status, 409); assert.equal(cfStale.writes.length, 0);
console.log("PASS cashfree: stale expected amount -> 409, nothing changed"); n++;
console.log(`\nall ${n} refund-function checks passed`);
