// cashfree-webhook  (verify_jwt = false; Cashfree cannot send a Supabase token) — deployed as index.ts together with cashfree.ts
//  1. Reads the RAW body and checks x-webhook-signature (Base64 HMAC-SHA256 of timestamp+rawBody with the client secret). The secret that
//     matches says which Cashfree environment (sandbox / production) sent it; the order is then confirmed in THAT environment, whatever the
//     provider setting says now. So switching provider or mode while a payment is in flight cannot leave a paid order unconfirmed.
//  2. Dedupes by event key (cashfree_events), so receiving the same event twice is harmless.
//  3. Never trusts the body for money: for a payment event it asks Cashfree for the order status itself.
//  4. Always answers 200 for a validly signed event unless a retry is wanted (Cashfree or database trouble => 500). Bad signature = 401.
// The logic lives in cashfree.ts (processWebhook) so it can be tested without Deno.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envsPreferring, processWebhook, type Mode } from "./cashfree.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text(); // raw body, exactly as sent
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: s } = await supabase.from("platform_settings").select("cashfree_mode").limit(1).maybeSingle();
  const preferred: Mode = s?.cashfree_mode === "production" ? "production" : "sandbox";
  const r = await processWebhook({
    raw,
    ts: req.headers.get("x-webhook-timestamp"),
    sig: req.headers.get("x-webhook-signature"),
    envs: envsPreferring(preferred, (n) => Deno.env.get(n)),
    rpc: (fn, args) => supabase.rpc(fn, args) as any,
  });
  if (r.status >= 500) console.error("cashfree-webhook", r.status, r.text);
  return new Response(r.text, { status: r.status });
});
