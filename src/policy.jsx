// Customer-facing booking policy: the words and the small components that show them.
// The numbers (case, deposit, refund, gateway fee, next change) all come from the database
// (booking_terms_preview / booking_cancel_quote, India time). Nothing here works out a date or a percentage.

export const money = (n) => {
  const v = Number(n || 0);
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return v.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
};
export const money2 = (n) =>
  Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// How long the venue has to answer a request (shown after the request is sent). Old keys are for old rows only.
export const RESPONSE_WINDOW_LABEL = { standard: "4 hours", late: "1 hour", secure: "2 hours", instant: "30 minutes" };

// A booking is either "standard" (more than 72 hours ahead) or "late". Old bookings with no case count as standard;
// an old non-refundable one stays non-refundable.
export const policyKind = (bookingType) => (bookingType === "late" || bookingType === "instant" ? "late" : "standard");

export function policySummaryText(kind, percent, amount) {
  return kind === "late"
    ? `This booking is within 72 hours of the event. Pay ${percent}% now (${money(amount)}). This amount is non-refundable.`
    : `Pay ${percent}% now (${money(amount)}) to confirm. Refundable: 100% until 72 hours before the event, 50% until 48 hours before, no refund after that. Pay the balance at the venue.`;
}

// Booking summary line + (late only) the tick box that must be ticked before the customer can go on.
export function PolicySummary({ kind, percent, amount, ack, onAck }) {
  const late = kind === "late";
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-xs mt-2 border ${
        late ? "border-red-400/40 bg-red-500/10 text-red-100" : "border-amber/30 bg-amber/10 text-ink"
      }`}
      data-testid="policy-summary"
    >
      <p>{policySummaryText(kind, percent, amount)}</p>
      {late && onAck && (
        <label className="flex items-start gap-2 mt-2 text-ink">
          <input
            type="checkbox"
            className="mt-0.5 accent-amber"
            checked={!!ack}
            onChange={(e) => onAck(e.target.checked)}
            data-testid="late-ack"
          />
          <span>I understand this amount is non-refundable.</span>
        </label>
      )}
    </div>
  );
}

// Short note shown just before paying a refundable (standard) deposit.
export function PayNote() {
  return (
    <p className="text-xs text-haze mt-2" data-testid="pay-note">
      If you cancel later, the payment gateway's fee is deducted from your refund. You'll see the exact amount before you
      confirm.
    </p>
  );
}

// The cancel screen: the exact refund from the database function, with the gateway-fee line, before the customer confirms.
export function CancelQuoteBox({ quote, busy, error, onConfirm, onBack }) {
  if (!quote) {
    return (
      <div className="border border-white/15 bg-white/5 rounded-lg p-2.5 text-xs text-haze">
        {error ? <span className="text-red-300">{error}</span> : "Working out your refund…"}
        <button type="button" onClick={onBack} className="block mt-2 text-haze hover:text-ink">
          Never mind
        </button>
      </div>
    );
  }
  if (!quote.can_cancel) {
    return (
      <div className="border border-white/15 bg-white/5 rounded-lg p-2.5">
        <p className="text-xs text-haze">{quote.reason || "This booking can't be cancelled online."}</p>
        <button type="button" onClick={onBack} className="mt-2 text-xs text-haze hover:text-ink">
          Back
        </button>
      </div>
    );
  }
  const fee = Number(quote.gateway_fee_deducted || 0);
  const Line = ({ k, v, strong }) => (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-ink border-t border-white/10 pt-1 mt-1" : "text-haze"}`}>
      <span>{k}</span>
      <span className={strong ? "text-amber" : "text-ink"}>{v}</span>
    </div>
  );
  return (
    <div className="border border-red-400/30 bg-red-500/10 rounded-lg p-2.5" data-testid="cancel-quote">
      <p className="text-xs text-ink">This cannot be undone. Here is exactly what you'll get back:</p>
      <div className="text-xs mt-2 flex flex-col gap-0.5">
        <Line k="Deposit paid" v={money2(quote.deposit_paid)} />
        <Line k={`Refund under the cancellation policy (${quote.refund_percent}%)`} v={money2(quote.policy_amount)} />
        {fee > 0 && (
          <Line
            k={`Payment gateway fee${quote.fee_is_estimate ? " (estimate)" : ""}`}
            v={`−${money2(fee)}`}
          />
        )}
        <Line k="You'll get back" v={money2(quote.refund_amount)} strong />
      </div>
      {quote.next_change_at && (
        <p className="text-xs text-haze mt-2">
          This amount changes after{" "}
          {new Date(quote.next_change_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      )}
      <p className="text-xs text-haze mt-1">
        This refund will be credited to your original payment method within 7–10 business days.
      </p>
      {error && <p className="text-xs text-red-300 mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="text-xs font-semibold bg-red-500/90 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Yes, cancel booking"}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className="text-xs text-haze hover:text-ink">
          Never mind
        </button>
      </div>
    </div>
  );
}
