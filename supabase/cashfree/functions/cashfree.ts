// Shared by create-cashfree-order, verify-cashfree-payment and cashfree-webhook. Each function is deployed with its own
// copy of this file (same pattern as the agreement functions). No Deno globals are used outside readEnv(), so the logic
// can be tested with plain node.
//
// What the docs say (www.cashfree.com/docs, read 2026-11-06):
//  - API version header x-api-version: latest is 2026-01-01 (previous 2025-01-01).
//  - Sandbox https://sandbox.cashfree.com/pg , production https://api.cashfree.com/pg
//  - GET /orders/{id} -> order_status ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED
//  - GET /orders/{id}/payments -> array, each payment_status SUCCESS | FAILED | USER_DROPPED | PENDING | ...
//  - Webhook signature: header x-webhook-signature = Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, clientSecret)).

export const API_VERSION = "2026-01-01";
export type Mode = "sandbox" | "production";
export type Env = { mode: Mode; base: string; clientId: string; clientSecret: string };
export type Getter = (name: string) => string | undefined;

export const ORDER_ID_RE = /^PX[a-f0-9]{32}$/; // the ids PAXO creates; anything else in the Cashfree account is ignored

// Four secret names so sandbox and production keys can both be set and a mode/keys mismatch can never happen:
//   CASHFREE_SANDBOX_CLIENT_ID  CASHFREE_SANDBOX_CLIENT_SECRET  CASHFREE_PROD_CLIENT_ID  CASHFREE_PROD_CLIENT_SECRET
export function envFor(mode: Mode, get: Getter): Env | null {
  const p = mode === "sandbox" ? "CASHFREE_SANDBOX" : "CASHFREE_PROD";
  const clientId = get(`${p}_CLIENT_ID`), clientSecret = get(`${p}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  return { mode, clientId, clientSecret, base: mode === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg" };
}

export async function cfFetch(env: Env, path: string, init: { method?: string; body?: unknown } = {}, doFetch: typeof fetch = fetch) {
  const res = await doFetch(`${env.base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-client-id": env.clientId,
      "x-client-secret": env.clientSecret,
      "x-api-version": API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data };
}

export type Confirm =
  | { status: "paid"; result: string }
  | { status: "pending" } // Cashfree has not (yet) reported a successful payment
  | { status: "not_paid"; order_status: string } // active/expired/terminated with no successful payment
  | { status: "error"; message: string }; // could not ask Cashfree: caller must NOT treat this as "not paid"

// Asks Cashfree (never the browser) whether the order is paid, then records it through the one database function.
// The amount and currency written to the database come from Cashfree's reply.
export async function confirmOrder(
  env: Env,
  orderId: string,
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>,
  doFetch: typeof fetch = fetch,
): Promise<Confirm> {
  if (!ORDER_ID_RE.test(orderId)) return { status: "error", message: "not a PAXO order" };
  const o = await cfFetch(env, `/orders/${orderId}`, {}, doFetch);
  if (!o.ok) return { status: "error", message: `Cashfree order lookup failed (${o.status})` };
  const orderStatus = String(o.data?.order_status ?? "");
  const p = await cfFetch(env, `/orders/${orderId}/payments`, {}, doFetch);
  if (!p.ok || !Array.isArray(p.data)) return { status: "error", message: `Cashfree payment lookup failed (${p.status})` };
  const payments = p.data as any[];
  const success = payments.find((x) => x?.payment_status === "SUCCESS");
  if (orderStatus === "PAID" && success) {
    const { data, error } = await rpc("cashfree_apply_payment", {
      p_order_id: orderId,
      p_cf_payment_id: String(success.cf_payment_id),
      p_amount: Number(success.payment_amount),
      p_currency: String(success.payment_currency ?? o.data?.order_currency ?? "INR"),
    });
    if (error) return { status: "error", message: "database error" };
    const result = String(data?.result ?? "");
    if (result.startsWith("paid") || result === "already paid") return { status: "paid", result };
    return { status: "not_paid", order_status: result || orderStatus }; // mismatch, unknown order, late payment, etc.
  }
  if (orderStatus === "PAID" || payments.some((x) => x?.payment_status === "PENDING")) return { status: "pending" };
  return { status: "not_paid", order_status: orderStatus || "UNKNOWN" };
}

// ---- webhook signature (raw body, constant time) -------------------------------------------------------------------
const enc = new TextEncoder();
function b64(bytes: ArrayBuffer): string {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export async function sign(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(timestamp + rawBody))); // timestamp directly followed by the raw body, no separator
}
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
export async function verifyWebhook(rawBody: string, timestamp: string | null, signature: string | null, secret: string): Promise<boolean> {
  if (!timestamp || !signature) return false;
  return safeEqual(await sign(secret, timestamp, rawBody), signature.trim());
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
