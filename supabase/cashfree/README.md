# Cashfree gateway (branch `cashfree-gateway`) — sandbox first, Razorpay stays the default

Nothing here is applied, deployed or merged. Razorpay code, tables and functions are unchanged.

## What was built
| Piece | File | Notes |
|---|---|---|
| Database | `migration.sql` (name `cashfree_gateway`) | `platform_settings.payment_provider` (default `razorpay`) and `cashfree_mode` (default `sandbox`); `payments.provider / cashfree_order_id / cashfree_payment_id`; `get_payment_provider()`; `cashfree_events` (dedupe log); `cashfree_apply_payment()` (the only thing that marks a Cashfree deposit paid); `cashfree_apply_charges()`. Rollback-tested with `test-tail.sql`. |
| Create order | `functions/create-cashfree-order.ts` | Amount comes from the database (`deposit_amount`, less the PAXO coupon, same rule as Razorpay). Refuses unless the setting says Cashfree. |
| Verify | `functions/verify-cashfree-payment.ts` | Browser only says "check order X". Server asks Cashfree for order status + payments, then calls the database function. |
| Webhook | `functions/cashfree-webhook.ts` | Raw-body signature check, event dedupe, re-confirms with Cashfree itself, always 200 for a valid signed event. **Not deployed.** |
| Shared | `functions/cashfree.ts` | Each function is deployed as `index.ts` + this file. 20 checks in `cashfree.test.mts`. |
| Refunds | `functions/process-booking-refund.patch.md` | Manual at launch; cancelling a Cashfree-paid booking records a pending refund + urgent alert with the Cashfree payment id. Not deployed. |
| App | `src/App.jsx` | Reads the setting at pay time; Cashfree modal checkout; "Test mode" label when sandbox; return-from-redirect check; receipt shows the Cashfree payment id. |

## Cashfree facts used (docs read 2026-11-06)
- API version header `x-api-version: 2026-01-01`; sandbox `https://sandbox.cashfree.com/pg`, production `https://api.cashfree.com/pg`.
- Webhook signature: `Base64( HMAC-SHA256( x-webhook-timestamp + rawBody, client secret ) )` in `x-webhook-signature`.
- Paid = order `order_status = PAID` **and** a payment with `payment_status = SUCCESS`; amount recorded is Cashfree's, and must equal the expected deposit.

## Secrets to add (Supabase → Edge Functions → Secrets). Values only by you.
`CASHFREE_SANDBOX_CLIENT_ID`, `CASHFREE_SANDBOX_CLIENT_SECRET` (needed now)
`CASHFREE_PROD_CLIENT_ID`, `CASHFREE_PROD_CLIENT_SECRET` (only at go-live)

## Webhook (register in Cashfree dashboard → Developers → Webhooks, only after the function is deployed)
URL `https://cjjksssylejwxwbalury.supabase.co/functions/v1/cashfree-webhook`
Events: Payment Success, Payment Failed, Payment User Dropped, (Payment Charges if your account has it). Version 2025-01-01 or later.

## Order of work (each step on your word)
1. `apply` migration  2. add sandbox secrets  3. deploy `create-cashfree-order` + `verify-cashfree-payment`  4. set provider to Cashfree (SQL below) and test with a preview build  5. say `deploy webhook`, register URL  6. re-test  7. `merge`.
**The app reads `payments.cashfree_payment_id`, so the migration must be applied before this branch is merged.**

```sql
-- switch ON for testing:  update platform_settings set payment_provider = 'cashfree', cashfree_mode = 'sandbox';
-- switch OFF (back to Razorpay): update platform_settings set payment_provider = 'razorpay';
```

## Test plan (sandbox; use Cashfree's test cards / test UPI from the sandbox docs)
1. Provider = razorpay: pay a deposit exactly as today. Nothing about Cashfree appears.
2. Provider = cashfree/sandbox: accepted booking shows "Test mode" note; Pay opens Cashfree modal.
3. Successful test payment → modal closes → booking becomes `confirmed`, payment `paid`, `cashfree_payment_id` stored, receipt shows it, commission row created.
4. Failed test payment → booking stays `accepted`, can pay again. Close the modal without paying → same.
5. Redirect path: pay with a UPI/3-DS flow that leaves the page → return to `/?cf_order=…` → My Bookings opens and shows the right status.
6. Amount tamper: change nothing in the browser can change the amount (the function ignores any amount); check order amount in Cashfree equals deposit minus coupon.
7. Webhook (after you say deploy): "Test webhook" button in Cashfree → 200; a real payment → one `cashfree_events` row, processed; resend the same event → 200 "already processed", no second payment row.
8. Bad signature: `curl` the webhook with a wrong signature → 401.
9. Double pay: pay, then try again on the same booking → blocked (booking no longer `accepted`); if Cashfree reports a second success, an urgent alert and a pending full refund appear.
10. Cancel a Cashfree-paid booking (after the refund patch is deployed) → booking cancelled, refund `pending`, urgent alert shows the Cashfree payment id.
11. Switch back to razorpay → everything as in step 1.

## Assumptions to confirm with Cashfree / in sandbox
- `order_expiry_time` minimum (we send 16–60 min ahead); `{order_id}` placeholder in `return_url`; exact webhook signature string (check once with Cashfree's webhook test).
- Gateway fee is stored as the same 2%+GST estimate (`gateway_fee_estimated = true`) until a Payment Charges webhook supplies the real one.
- Customer needs a valid 10-digit Indian mobile on the booking (Cashfree requires a phone).
- Party Pool: not done yet — will be added after this flow is proven in sandbox.
