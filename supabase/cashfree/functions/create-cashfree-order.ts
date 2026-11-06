// create-cashfree-order  (verify_jwt = true)  — deployed as index.ts together with cashfree.ts
// Creates a Cashfree order for a booking DEPOSIT. The amount comes from the database (booking.deposit_amount, less any
// PAXO coupon decided by coupon_prepare_payment) — the browser sends only booking_id. Same rules as create-razorpay-order.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envFor, cfFetch, corsHeaders, jsonRes, type Mode } from "./cashfree.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NOT_PAYABLE: Record<string, string> = {
  pending: "The venue hasn't accepted this request yet.",
  confirmed: "This booking is already paid.",
  completed: "This booking is already paid.",
  cancelled: "This booking was cancelled, so it can't be paid.",
  rejected: "The venue declined this request, so it can't be paid.",
  payment_expired: "The payment window for this booking has ended.",
  no_show: "This booking can no longer be paid.",
};

// Where Cashfree sends the customer back to after a redirect-style payment (UPI apps, 3-D Secure). Only our own sites.
const ALLOWED_ORIGIN = /^https:\/\/(www\.)?mypaxo\.in$|^http:\/\/localhost:\d+$/;
function returnOrigin(req: Request): string {
  const o = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGIN.test(o) ? o : "https://www.mypaxo.in";
}

function tenDigits(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  const n = d.length > 10 ? d.slice(-10) : d;
  return /^[6-9]\d{9}$/.test(n) ? n : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { booking_id, payment_type, acknowledged_non_refundable } = await req.json();
    const type = payment_type ?? "deposit";
    if (!booking_id) return jsonRes({ error: "booking_id is required" }, 400);
    if (type !== "deposit") return jsonRes({ error: "Only the deposit can be paid online. The balance is paid at the venue." }, 400);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // The switch. This function refuses to run unless the setting says Cashfree.
    const { data: prov } = await serviceClient.rpc("get_payment_provider");
    if (prov?.provider !== "cashfree") return jsonRes({ error: "Cashfree is not switched on." }, 409);
    const mode: Mode = prov.mode === "production" ? "production" : "sandbox";
    const env = envFor(mode, (n) => Deno.env.get(n));
    if (!env) return jsonRes({ error: `Cashfree ${mode} keys are not set up yet.` }, 503);

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: booking, error: bookingError } = await callerClient
      .from("bookings")
      .select("id, status, payment_deadline, deposit_amount, customer_id, booking_type, contact_name, contact_email, contact_mobile")
      .eq("id", booking_id)
      .single();
    if (bookingError || !booking) return jsonRes({ error: "Booking not found or not yours" }, 404);

    if (booking.status !== "accepted") return jsonRes({ error: NOT_PAYABLE[booking.status] ?? "This booking can't be paid right now." }, 400);
    if (!booking.payment_deadline || new Date(booking.payment_deadline).getTime() <= Date.now()) {
      return jsonRes({ error: "The payment window for this booking has ended." }, 400);
    }
    const isLate = booking.booking_type === "late";
    if (isLate && acknowledged_non_refundable !== true) {
      return jsonRes({ error: "Please confirm that this deposit is non-refundable before paying." }, 400);
    }
    const deposit = Number(booking.deposit_amount);
    if (!deposit || deposit <= 0) return jsonRes({ error: "Nothing to charge for this payment type" }, 400);

    // Same coupon rule as Razorpay: the DATABASE decides the discount; if the lookup fails the customer pays the full deposit.
    const { data: prepData, error: prepError } = await serviceClient.rpc("coupon_prepare_payment", { p_booking_id: booking_id });
    if (prepError) console.error("coupon_prepare_payment failed:", prepError.message);
    const prep = !prepError && prepData ? prepData : { applies: false, final_amount: deposit };
    const amount = Number(prep.final_amount);
    if (!amount || amount <= 0) return jsonRes({ error: "Nothing to charge for this payment type" }, 400);
    const couponId: string | null = prep.applies ? (prep.coupon_id ?? null) : null;
    const couponDiscount = prep.applies ? Number(prep.discount ?? 0) : 0;
    const amountPaise = Math.round(amount * 100);

    const reply = async (orderId: string) => {
      const o = await cfFetch(env, `/orders/${orderId}`);
      if (!o.ok || !o.data?.payment_session_id) return jsonRes({ error: "Cashfree could not give us the checkout session. Please try again." }, 502);
      return jsonRes({
        provider: "cashfree", mode: env.mode, order_id: orderId, payment_session_id: o.data.payment_session_id,
        amount: amountPaise, currency: "INR",
      });
    };

    // One open order per booking: reuse the open Cashfree order when the amount matches, otherwise retire it.
    const { data: open } = await serviceClient
      .from("payments").select("id, provider, cashfree_order_id, amount")
      .eq("booking_id", booking_id).eq("payment_type", "deposit").eq("status", "created");
    const same = (open ?? []).find((p) => p.provider === "cashfree" && p.cashfree_order_id && Math.round(Number(p.amount) * 100) === amountPaise);
    if (same) return await reply(same.cashfree_order_id);
    for (const old of open ?? []) await serviceClient.from("payments").update({ status: "failed" }).eq("id", old.id);

    const phone = tenDigits(booking.contact_mobile);
    if (!phone) return jsonRes({ error: "Please add a valid 10-digit mobile number to this booking before paying." }, 400);

    const orderId = "PX" + crypto.randomUUID().replaceAll("-", "");
    // Cashfree wants the expiry at least ~15 minutes ahead; follow the payment deadline but stay inside [16 min, 60 min].
    const now = Date.now();
    const expiry = new Date(Math.min(Math.max(new Date(booking.payment_deadline).getTime(), now + 16 * 60000), now + 60 * 60000));
    const cf = await cfFetch(env, "/orders", {
      method: "POST",
      body: {
        order_id: orderId,
        order_amount: Number(amount.toFixed(2)),
        order_currency: "INR",
        customer_details: {
          customer_id: String(booking.customer_id).replaceAll("-", "").slice(0, 40),
          customer_phone: phone,
          ...(booking.contact_email ? { customer_email: String(booking.contact_email) } : {}),
          ...(booking.contact_name ? { customer_name: String(booking.contact_name).slice(0, 100) } : {}),
        },
        order_meta: { return_url: `${returnOrigin(req)}/?cf_order={order_id}` },
        order_expiry_time: expiry.toISOString(),
        order_note: "PAXO booking deposit",
      },
    });
    if (!cf.ok || cf.data?.order_id !== orderId) {
      console.error("Cashfree create order failed", cf.status, JSON.stringify(cf.data)?.slice(0, 300));
      return jsonRes({ error: "Cashfree order creation failed" }, 502);
    }

    const { data: inserted, error: insertError } = await serviceClient.from("payments").insert({
      booking_id,
      provider: "cashfree",
      cashfree_order_id: orderId,
      amount,
      payment_type: type,
      status: "created",
      non_refundable_ack_at: isLate ? new Date().toISOString() : null,
      coupon_id: couponId,
      coupon_discount: couponDiscount,
    }).select("id").single();

    if (insertError) {
      if (insertError.code === "23505") { // two requests raced: the open-order index kept the first one
        const { data: winner } = await serviceClient.from("payments").select("cashfree_order_id")
          .eq("booking_id", booking_id).eq("payment_type", "deposit").eq("status", "created").eq("provider", "cashfree").limit(1).single();
        if (winner?.cashfree_order_id) return await reply(winner.cashfree_order_id);
      }
      return jsonRes({ error: "Failed to record payment" }, 500);
    }
    if (prep.applies && prep.redemption_id && inserted?.id) {
      await serviceClient.rpc("coupon_attach_payment", { p_redemption_id: prep.redemption_id, p_payment_id: inserted.id });
    }
    return await reply(orderId);
  } catch (err) {
    console.error("create-cashfree-order", String(err));
    return jsonRes({ error: "Something went wrong starting the payment." }, 500);
  }
});
