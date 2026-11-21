// Run: node scripts/test-mobile.mjs
// Tests the Indian-mobile rule in the app (src/phone.js) AND the copy inside create-cashfree-order.ts (extracted from the
// file and run, so the two cannot drift apart).
import { readFileSync } from "node:fs";
import { normalizeIndianMobile as appRule } from "../src/phone.js";

const ts = readFileSync(new URL("../supabase/cashfree/functions/create-cashfree-order.ts", import.meta.url), "utf8");
const m = ts.match(/function normalizeIndianMobile\(raw: unknown\): string \| null \{[\s\S]*?\n\}/);
if (!m) throw new Error("normalizeIndianMobile not found in create-cashfree-order.ts");
const js = m[0].replace("(raw: unknown): string | null", "(raw)").replace("let n: string | null = null", "let n = null");
const fnRule = new Function(js + "; return normalizeIndianMobile;")();

const cases = [
  ["10 digits", "9876543210", "9876543210"],
  ["+91 with spaces", "+91 98765 43210", "9876543210"],
  ["spaces and dashes", "98765-43210", "9876543210"],
  ["spaces, dashes, brackets", " (987) 654-3210 ", "9876543210"],
  ["0 + 10 digits", "09876543210", "9876543210"],
  ["91 + 10 digits", "919876543210", "9876543210"],
  ["+91 + 10 digits, no spaces", "+919876543210", "9876543210"],
  ["11 digits not starting with 0", "19876543210", null],
  ["12 digits not starting with 91", "129876543210", null],
  ["8 digits", "98765432", null],
  ["first digit 5", "5876543210", null],
  ["junk followed by ten valid digits", "abc9876543210", null],
  ["digits before ten valid digits (13 digits)", "1239876543210", null],
  ["text then number", "call 9876543210", null],
  ["two numbers", "9876543210 9876543210", null],
  ["blank", "", null],
  ["null", null, null],
  ["+ not at the start", "98765+43210", null],
  ["91 + number starting with 5", "915876543210", null],
];

let failed = 0;
for (const [name, input, want] of cases) {
  const a = appRule(input);
  const b = fnRule(input);
  const ok = a === want && b === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(44)} ${JSON.stringify(input)} -> ${JSON.stringify(a)} (function: ${JSON.stringify(b)})${ok ? "" : `  expected ${JSON.stringify(want)}`}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed (each case runs against the app rule and the function rule)`);

// ---- Ownership check: only the booking's own customer may start its payment (partners/admins can read the row but not pay). ----
const om = ts.match(/function callerOwnsBooking\([^)]*\): boolean \{[\s\S]*?\n\}/);
if (!om) throw new Error("callerOwnsBooking not found in create-cashfree-order.ts");
const owns = new Function(om[0].replace(/\([^)]*\): boolean/, "(userId, bookingCustomerId)") + "; return callerOwnsBooking;")();
const CUSTOMER = "11111111-1111-1111-1111-111111111111";
const PARTNER = "22222222-2222-2222-2222-222222222222";
const ownCases = [
  ["booking's own customer is accepted", CUSTOMER, CUSTOMER, true],
  ["a different user (partner/admin) is rejected", PARTNER, CUSTOMER, false],
  ["no signed-in user is rejected", null, CUSTOMER, false],
  ["undefined user is rejected", undefined, CUSTOMER, false],
  ["booking without a customer id is rejected", CUSTOMER, null, false],
];
let ownFailed = 0;
for (const [name, uid, cid, want] of ownCases) {
  const got = owns(uid, cid);
  const ok = got === want;
  if (!ok) ownFailed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ownership: ${name.padEnd(46)} -> ${got}`);
}
// The check must come before any write and before any Cashfree call in the function.
const at = (re) => ts.search(re);
const checkAt = at(/callerOwnsBooking\(userData/);
const firstWrite = Math.min(...[at(/\.update\(/), at(/\.insert\(/), at(/cfFetch\(env, "\/orders"/), at(/rpc\("coupon_prepare_payment"/)].filter((i) => i >= 0));
const orderOk = checkAt > 0 && checkAt < firstWrite;
if (!orderOk) ownFailed++;
console.log(`${orderOk ? "PASS" : "FAIL"}  ownership check sits before the first write / Cashfree order / coupon call in the function`);
console.log(`${ownCases.length + 1 - ownFailed}/${ownCases.length + 1} ownership checks passed`);
process.exit(failed || ownFailed ? 1 : 0);
