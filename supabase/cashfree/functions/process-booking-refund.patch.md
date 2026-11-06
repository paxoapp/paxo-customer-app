# process-booking-refund — change needed so a Cashfree-paid booking can be cancelled (NOT deployed)

Today the function stops with a 500 ("Payment has no razorpay_payment_id on record") for any paid deposit that was not paid
through Razorpay, so a customer could not cancel a Cashfree-paid booking. Refunds stay manual at launch, so the change does
**not** call Cashfree. It keeps the cancellation and the refund quote exactly as they are, records the refund as `pending`
with no automatic retry, and raises an urgent alert with the Cashfree payment id so you can refund by hand in the Cashfree dashboard.

Rules, quote, percentages, fee deduction, the booking cancellation and the Razorpay path are untouched.

Replace this block:

```ts
    if (refundAmount > 0) {
      if (!payment.razorpay_payment_id) {
        return jsonRes({ error: "Payment has no razorpay_payment_id on record — cannot refund" }, 500);
      }
      const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
```

with:

```ts
    let manualCashfree = false;
    if (refundAmount > 0 && payment.provider === "cashfree") {
      // Manual at launch: nothing is sent to Cashfree from here. The refund stays 'pending' with no retry time,
      // so the Razorpay retry job never touches it, and an urgent alert tells the team exactly what to refund.
      if (!payment.cashfree_payment_id) {
        return jsonRes({ error: "Payment has no cashfree_payment_id on record — cannot refund" }, 500);
      }
      manualCashfree = true;
      refundStatus = "pending";
      lastError = "Manual Cashfree refund needed";
    } else if (refundAmount > 0) {
      if (!payment.razorpay_payment_id) {
        return jsonRes({ error: "Payment has no razorpay_payment_id on record — cannot refund" }, 500);
      }
      const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
```

In the `payments` update, change the two lines that depend on `refundStatus === "pending"`:

```ts
        refund_attempts: refundStatus === "pending" ? 1 : 0,
        refund_next_retry_at: refundStatus === "pending" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
```

to:

```ts
        refund_attempts: refundStatus === "pending" && !manualCashfree ? 1 : 0,
        refund_next_retry_at: refundStatus === "pending" && !manualCashfree ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
```

And replace the alert block (`if (refundStatus === "pending") { ... }`) with:

```ts
    if (manualCashfree) {
      await serviceClient.from("admin_alerts").insert({
        kind: "refund_pending",
        booking_id,
        payment_id: payment.id,
        urgent: true,
        message: `Refund needed: ₹${refundAmount} to the customer for a cancelled booking. It was paid through Cashfree (payment id ${payment.cashfree_payment_id}, order ${payment.cashfree_order_id}). Please refund it by hand in the Cashfree dashboard, then mark it refunded.`,
      });
    } else if (refundStatus === "pending") {
      /* existing Razorpay balance alert, unchanged */
    }
```

Check before deploying: `admin_alerts` accepts `urgent` (the Razorpay webhook functions already insert `urgent: true`) and `kind = 'refund_pending'` (already used above).
After a manual refund, mark the payment `refund_status = 'processed'`, `refunded_at = now()` in the admin Settlements/refund screen the same way the late-payment refunds are handled today.
