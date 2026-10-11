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

// ---------------- alcohol notice (one text, used everywhere) ----------------
export const ALCOHOL_NOTICE =
  "This package includes alcohol. Alcohol is served only to guests who are of legal drinking age under the law of the state where the venue is located. Please carry a valid government-issued photo ID (such as Aadhaar, passport, driving licence or voter ID). The venue may ask to see it and can refuse to serve alcohol if your age cannot be verified.";

export function AlcoholNotice({ className = "" }) {
  return (
    <p className={`text-xs text-haze ${className}`} data-testid="alcohol-notice">
      {ALCOHOL_NOTICE}
    </p>
  );
}

// ---------------- save feedback ----------------
// "Mon, 12 Oct 2026, 8:00 pm" in India time, from the cut-off the database returns.
export function fmtEditUntil(iso) {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
  const dm = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  const t = d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  return `${wd}, ${dm}, ${t}`;
}
export function fmtSavedAt(date = new Date()) {
  return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

// What the customer is told when a save fails: the reason, then what to do.
export function saveErr(prefix, e) {
  const reason = (e?.message || "").trim();
  const sentence = reason ? (/[.!?]$/.test(reason) ? reason : reason + ".") : "";
  return `${prefix} ${sentence} Please try again, or contact PAXO support if this keeps happening.`.replace(/\s+/g, " ");
}

// The plain-words reason an edit is locked, from booking_edit_quote.lock_reason.
export function lockMessage(q) {
  switch (q?.lock_reason) {
    case "too_close":
      return "Your menu is now locked because your event is less than 24 hours away. To make a change, please contact PAXO support.";
    case "late":
      return "This booking was made within 72 hours of the event, so the menu can't be changed once it has been saved. To make a change, please contact PAXO support.";
    case "untyped":
      return "This booking's menu can't be changed online. To make a change, please contact PAXO support.";
    case "not_confirmed":
      return "Your menu can be chosen once your booking is confirmed.";
    default:
      return "Your menu can't be changed online right now. To make a change, please contact PAXO support.";
  }
}

// The line shown above the menu: editable (with the exact cut-off), locked, or (nothing saved yet) what happens after saving.
export function editNotice(q, { anyLocked }) {
  if (!q) return null;
  if (q.can_edit) return { kind: "open", text: `You can change your menu until ${fmtEditUntil(q.edit_until)}.` };
  if (anyLocked || q.lock_reason === "not_confirmed") return { kind: "locked", text: lockMessage(q) };
  const after = {
    too_close: "Your event is less than 24 hours away, so once you save your menu it can't be changed online.",
    late: "This booking was made within 72 hours of the event, so once you save your menu it can't be changed online.",
    untyped: "Once you save your menu it can't be changed online.",
  }[q.lock_reason];
  return { kind: "info", text: `${after || "Once you save your menu it can't be changed online."} To make a change after that, please contact PAXO support.` };
}

const NOTICE_STYLE = {
  open: "border-amber/30 bg-amber/10 text-ink",
  info: "border-amber/30 bg-amber/10 text-ink",
  locked: "border-white/20 bg-white/5 text-haze",
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  err: "border-red-400/40 bg-red-500/10 text-red-200",
};
export function StatusNotice({ kind, children, className = "" }) {
  return (
    <div
      role={kind === "err" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2 text-sm ${NOTICE_STYLE[kind] || NOTICE_STYLE.info} ${className}`}
      data-testid={`notice-${kind}`}
    >
      {children}
    </div>
  );
}

// ---------------- success messages for the saves on the booking page ----------------
export const disclosureOkText = (response) =>
  response === "approved"
    ? "Your response was saved. You approved going ahead, so you can now pay your deposit."
    : "Your response was saved. You declined, so this request has been closed.";
export const addonOkText = (decision) =>
  decision === "confirmed" ? "Add-on accepted. You'll pay for it at the venue." : "Add-on declined. The rest of your booking is unchanged.";
export const CANCEL_PENDING_OK = "Your request was cancelled. The venue has been told.";
export const feedbackOkText = (status) =>
  status === "skipped" ? "Feedback skipped. You can still add it later." : "Thank you. Your feedback was saved.";
export const menuSavedText = (date = new Date()) => `Menu saved successfully. Last saved ${fmtSavedAt(date)}.`;
