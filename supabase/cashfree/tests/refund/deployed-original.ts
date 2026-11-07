import { createClient } from "jsr:@supabase/supabase-js@2";

// The Razorpay key id comes from the RAZORPAY_KEY_ID secret (no fallback: a missing secret must fail loudly).
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
if (!RAZORPAY_KEY_ID) throw new Error("RAZORPAY_KEY_ID secret is not set");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Launch policy. This function does NO date or percentage maths: the hours to the event, the case
// (standard / late), the refund percent, the gateway-fee deduction and the refunded / forfeited
// amounts all come from the database function booking_cancel_quote (India time). The customer app
// shows the same function's answer on the cancel screen and sends it back as expected_refund_amount;
// if the answer has changed by the time the customer confirms (a slab boundary passed), nothing is
// refunded and the new quote is returned (409) so the customer sees the real amount first.
//
// Razorpay balance too low: the booking is still cancelled, the refund is marked pending, an admin
// alert is raised and payments-maintenance retries it. Any other Razorpay failure changes nothing.
const REQUIRE_EXPECTED_AMOUNT = true; // both apps now send expected_refund_amount (the fallback was removed)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const { booking_id, initiated_by, cancellation_reason, expected_refund_amount } = await req.json();

    if (!booking_id || !initiated_by) {
      return jsonRes({ error: "booking_id and initiated_by are required" }, 400);
    }
    if (initiated_by !== "customer" && initiated_by !== "admin") {
      return jsonRes({ error: "initiated_by must be 'customer' or 'admin'" }, 400);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: booking, error: bookingErr } = await serviceClient
      .from("bookings")
      .select("id, customer_id, venue_id, status")
      .eq("id", booking_id)
      .single();
    if (bookingErr || !booking) return jsonRes({ error: "Booking not found" }, 404);

    // Authorize the caller
    if (initiated_by === "customer") {
      // The signed-in user must BE the customer on the booking. (Reading the booking through the caller's
      // access is not enough: a venue partner or an admin can read it too, and a customer cancellation
      // is what makes a paid coupon forfeit.) Admins cancel through the admin route below.
      const authedUser = await callerClient.auth.getUser();
      const uid = authedUser.data.user?.id;
      if (!uid) return jsonRes({ error: "Unauthorized" }, 401);
      if (uid !== booking.customer_id) return jsonRes({ error: "Not your booking" }, 403);
    } else {
      const authedUser = await callerClient.auth.getUser();
      const uid = authedUser.data.user?.id;
      if (!uid) return jsonRes({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await serviceClient.from("admin_users").select("id").eq("id", uid).single();
      if (!isAdmin) return jsonRes({ error: "Admin access required" }, 403);
    }

    // The one rule book (India time, in the database)
    const { data: quote, error: quoteErr } = await serviceClient.rpc("booking_cancel_quote", {
      p_booking_id: booking_id,
      p_initiator: initiated_by,
    });
    if (quoteErr || !quote) return jsonRes({ error: "Couldn't work out the refund. Please try again." }, 500);
    if (!quote.can_cancel) return jsonRes({ error: quote.reason || "This booking can't be cancelled." }, 400);

    if (initiated_by === "customer") {
      if (expected_refund_amount === undefined || expected_refund_amount === null) {
        if (REQUIRE_EXPECTED_AMOUNT) {
          return jsonRes({ error: "Please review the refund amount and confirm again.", quote }, 409);
        }
      } else if (Math.abs(Number(expected_refund_amount) - Number(quote.refund_amount)) > 0.004) {
        return jsonRes({ error: "The refund amount has changed. Please check the new amount and confirm again.", quote }, 409);
      }
    }

    const { data: payment, error: paymentErr } = await serviceClient
      .from("payments")
      .select("*")
      .eq("booking_id", booking_id)
      .eq("payment_type", "deposit")
      .eq("status", "paid")
      .single();
    if (paymentErr || !payment) return jsonRes({ error: "No paid deposit found for this booking" }, 404);

    const refundAmount = Number(quote.refund_amount);
    let razorpayRefundId: string | null = null;
    let refundStatus: "processed" | "pending" = "processed";
    let lastError: string | null = null;

    if (refundAmount > 0) {
      if (!payment.razorpay_payment_id) {
        return jsonRes({ error: "Payment has no razorpay_payment_id on record — cannot refund" }, 500);
      }
      const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
      const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${payment.razorpay_payment_id}/refund`, {
        method: "POST",
        headers: { Authorization: `Basic ${rzpAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.round(refundAmount * 100) }),
      });
      const rzpRefund = await rzpRes.json();
      if (rzpRes.ok) {
        razorpayRefundId = rzpRefund.id;
      } else if (/balance/i.test(String(rzpRefund?.error?.description ?? ""))) {
        refundStatus = "pending";
        lastError = String(rzpRefund?.error?.description ?? "Insufficient Razorpay balance");
      } else {
        return jsonRes({ error: "Razorpay refund failed", details: rzpRefund }, 502);
      }
    }

    const nowIso = new Date().toISOString();
    await serviceClient
      .from("payments")
      .update({
        refund_amount: refundAmount,
        refund_percent: quote.refund_percent,
        refund_status: refundStatus,
        refunded_at: refundStatus === "processed" ? nowIso : null,
        razorpay_refund_id: razorpayRefundId,
        settlement_status: "pending",
        forfeited_amount: quote.forfeited_amount,
        gateway_fee_deducted: quote.gateway_fee_deducted,
        refund_attempts: refundStatus === "pending" ? 1 : 0,
        refund_last_error: lastError,
        refund_next_retry_at: refundStatus === "pending" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      })
      .eq("id", payment.id);

    await serviceClient
      .from("bookings")
      .update({
        status: "cancelled",
        cancellation_reason: cancellation_reason ?? null,
        cancelled_at: nowIso,
        cancelled_by: initiated_by,
      })
      .eq("id", booking_id);

    if (refundStatus === "pending") {
      await serviceClient.from("admin_alerts").insert({
        kind: "refund_pending",
        booking_id,
        payment_id: payment.id,
        message: `A refund of ₹${refundAmount} could not be sent because the Razorpay balance is too low. It will be retried every 30 minutes. Please top up the Razorpay refund balance (this takes 2–4 hours).`,
      });
    }

    return jsonRes({
      ok: true,
      refund_status: refundStatus,
      refund_percent: quote.refund_percent,
      refund_amount: refundAmount,
      forfeited_amount: quote.forfeited_amount,
      gateway_fee_deducted: quote.gateway_fee_deducted,
      fee_is_estimate: quote.fee_is_estimate,
      settlement_status: Number(quote.forfeited_amount) > 0 ? "pending" : "n/a",
    });
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});
