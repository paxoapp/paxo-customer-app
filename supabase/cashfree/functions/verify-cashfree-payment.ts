// verify-cashfree-payment  (verify_jwt = true)  — deployed as index.ts together with cashfree.ts
// The browser says "I think order X was paid". We do not believe it: we ask Cashfree, then record via the database function.
// The order is looked up in whichever Cashfree environment it exists in (the stored mode first), so a provider or mode switch in the
// middle of a payment cannot leave a paid order unconfirmed.
// A cancelled/failed/abandoned payment changes nothing (the booking stays 'accepted' and can be paid again).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envsPreferring, confirmOrderAnyEnv, corsHeaders, jsonRes, type Mode } from "./cashfree.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string") return jsonRes({ error: "order_id is required" }, 400);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

    const { data: pay } = await serviceClient.from("payments").select("id, booking_id, provider").eq("cashfree_order_id", order_id).maybeSingle();
    if (!pay || pay.provider !== "cashfree") return jsonRes({ error: "No matching payment record" }, 404);
    const { data: mine } = await callerClient.from("bookings").select("id").eq("id", pay.booking_id).maybeSingle();
    if (!mine) return jsonRes({ error: "Not your booking" }, 403);

    const { data: s } = await serviceClient.from("platform_settings").select("cashfree_mode").limit(1).maybeSingle();
    const preferred: Mode = s?.cashfree_mode === "production" ? "production" : "sandbox";
    const envs = envsPreferring(preferred, (n) => Deno.env.get(n));
    if (envs.length === 0) return jsonRes({ error: "Cashfree keys are not set up yet." }, 503);

    const r = await confirmOrderAnyEnv(envs, order_id, (fn, args) => serviceClient.rpc(fn, args) as any);
    if (r.status === "paid") return jsonRes({ verified: true });
    if (r.status === "pending") return jsonRes({ verified: false, pending: true, message: "Your payment is still being confirmed. This page will update shortly." });
    if (r.status === "error") { console.error("verify-cashfree-payment", r.message); return jsonRes({ verified: false, pending: true, message: "We couldn't reach the payment provider just now. If money was taken, your booking will confirm automatically." }, 200); }
    return jsonRes({ verified: false, error: "The payment was not completed. You have not been charged for this booking." });
  } catch (err) {
    console.error("verify-cashfree-payment", String(err));
    return jsonRes({ error: "Something went wrong confirming the payment." }, 500);
  }
});
