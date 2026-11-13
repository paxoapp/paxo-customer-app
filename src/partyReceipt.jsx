// Party Pool: deposit receipt + "What happens next" box (customer side).
// Receipts come from the database function party_my_receipts() (the customer's own, frozen when the deposit was paid).
// Nothing here computes money: every figure on a receipt is a stored value. No tax split and no mention of drinks, by design.
// api = { session, sb, callFn } passed from the app (this file never imports the app).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const inr2 = (n) => Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : "";

// The customer's receipts for one party. Asked once per signed-in user / party, and again only when what they have paid changes.
// Primitive dependencies and a ref for the api object: a redraw of the page can never trigger another call.
export function useMyReceipts(api, partyId, enabled, paidKey) {
  const [rows, setRows] = useState([]);
  const apiRef = useRef(api);
  apiRef.current = api;
  const token = api?.session?.token || null;
  useEffect(() => {
    let alive = true;
    if (!token || !partyId || !enabled) {
      setRows((old) => (old.length ? [] : old));
      return undefined;
    }
    apiRef.current
      .sb("/rest/v1/rpc/party_my_receipts", { method: "POST", token, body: { p_party_id: partyId } })
      .then((r) => {
        if (!alive) return;
        const next = Array.isArray(r) ? r : [];
        setRows((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      })
      .catch(() => alive && setRows((old) => (old.length ? [] : old)));
    return () => { alive = false; };
  }, [token, partyId, enabled, paidKey]);
  return rows;
}

// "What happens next" on the party booking card. Same wording as the receipt email.
export function PartyNextBox({ party, mine }) {
  if (!party || !mine || mine.status !== "active" || !(Number(mine.seats_paid) > 0)) return null;
  if (Number(mine.refund_due) > 0 || Number(mine.refunded) > 0) return null;
  if (party.status !== "published" && party.status !== "confirmed") return null;
  const confirmed = party.status === "confirmed";
  const total = Number(mine.total_amount || 0);
  const balance = Math.max(total - Number(mine.paid_amount || 0), 0);
  const min = Number(party.min_paid_seats || 0);
  const count = Number(party.paid_total || 0);
  const closes = fmtWhen(party.closes_at);
  const items = [];
  if (!confirmed) {
    items.push(
      <>The party is confirmed once <b>{min}</b> seats are paid. Right now <b data-testid="party-next-count">{count} of {min}</b> paid.</>
    );
    items.push(
      <>
        After confirmation we email you, and you then have <b>up to 48 hours</b> to pay the balance
        {balance > 0 ? <> of <b data-testid="party-next-balance">{inr2(balance)}</b></> : null}. The exact deadline is in that email.
        {closes ? <> Joining closes on <b>{closes}</b>.</> : null}
      </>
    );
    items.push(<>If the party does not fill, PAXO cancels it and refunds you 100%.</>);
    items.push(<>The 30% deposit is non-refundable if you cancel or do not pay the balance.</>);
    items.push(<>After the balance is paid in full, you get your final invoice.</>);
  } else if (balance > 0) {
    items.push(
      <>
        The party is confirmed. Please pay the balance of <b data-testid="party-next-balance">{inr2(balance)}</b>
        {mine.balance_due_by ? <> by <b data-testid="party-next-deadline">{fmtWhen(mine.balance_due_by)}</b></> : <>. The exact deadline is in your confirmation email</>}.
      </>
    );
    if (party.joining_open && closes) items.push(<>Joining closes on <b>{closes}</b>.</>);
    items.push(<>The 30% deposit is non-refundable if you cancel or do not pay the balance.</>);
    items.push(<>After the balance is paid in full, you get your final invoice.</>);
  } else {
    items.push(<>The party is confirmed and your balance is paid in full.</>);
    items.push(<>Your final invoice is listed under Party invoices in My bookings.</>);
  }
  return (
    <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-next">
      <p className="text-ink font-semibold">What happens next</p>
      <ul className="mt-2 list-disc pl-5 text-haze flex flex-col gap-1.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function Row({ label, children, testid }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-stone-200 text-sm" data-testid={testid}>
      <dt className="text-stone-500 shrink-0">{label}</dt>
      <dd className="text-stone-900 font-semibold text-right break-words min-w-0">{children}</dd>
    </div>
  );
}

// The receipt screen: a full-screen layer on top of the page (rendered outside the app shell so only it prints).
export function PartyReceiptModal({ receipts, onClose }) {
  const [idx, setIdx] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    document.body.classList.add("party-receipt-open");
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("party-receipt-open");
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const list = Array.isArray(receipts) ? receipts : [];
  const r = list[Math.min(idx, Math.max(list.length - 1, 0))];
  if (!r) return null;
  const seats = Number(r.seats || 0);
  const bookingSeats = Number(r.booking_seats || 0) || seats;
  const guests = Array.isArray(r.guests) ? r.guests.filter(Boolean) : [];
  return createPortal(
    <div className="party-receipt-overlay fixed inset-0 z-[100] overflow-y-auto bg-black/80 px-4 py-6" data-testid="party-receipt-screen" role="dialog" aria-modal="true" aria-label="Payment receipt">
      <div className="party-receipt-card max-w-md mx-auto">
        <div className="no-print flex items-center justify-between gap-3 mb-3">
          <button type="button" onClick={onClose} className="text-sm text-haze hover:text-ink" data-testid="party-receipt-close">← Back</button>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-amber text-[#170D0B] font-semibold px-5 py-2 text-sm" data-testid="party-receipt-print">Print / Save as PDF</button>
        </div>
        {list.length > 1 && (
          <div className="no-print flex flex-wrap gap-2 mb-3" data-testid="party-receipt-picker">
            {list.map((x, i) => (
              <button key={x.payment_id || i} type="button" onClick={() => setIdx(i)}
                className={`text-xs rounded-full px-3 py-1 border ${i === idx ? "border-amber text-amber bg-amber/10" : "border-white/20 text-haze"}`}>
                {x.receipt_no}
              </button>
            ))}
          </div>
        )}
        <div className="receipt-print bg-white text-stone-900 rounded-xl p-6 shadow-card" data-testid="party-receipt">
          <div className="flex items-center justify-between">
            <span className="font-display text-2xl font-extrabold tracking-wide" style={{ color: "#F5A623" }}>PAXO</span>
            <span className="text-xs text-stone-500">Payment receipt</span>
          </div>
          <h2 className="font-display text-xl font-bold mt-4">Receipt for your deposit</h2>
          {r.refunded && (
            <p className="mt-3 rounded-lg bg-stone-100 border border-stone-300 px-3 py-2 text-sm text-stone-700" data-testid="party-receipt-refunded">
              This payment has been refunded or is being refunded. This receipt is kept for your records.
            </p>
          )}
          <dl className="mt-3">
            <Row label="Receipt number" testid="rc-no">{r.receipt_no}</Row>
            <Row label="Paid on" testid="rc-paid">{r.paid_at_text}</Row>
            <Row label="Party" testid="rc-party">{r.party_title}</Row>
            <Row label="Venue" testid="rc-venue">{r.venue_name}</Row>
            <Row label="Party date and time" testid="rc-start">{r.party_start_text}</Row>
            <Row label="Guests" testid="rc-guests">
              {guests.length ? guests.map((g, i) => <span key={i} className="block">{g}</span>) : "—"}
            </Row>
            <Row label="Seats" testid="rc-seats">{seats === bookingSeats ? seats : `${seats} in this payment (${bookingSeats} on your booking)`}</Row>
            <Row label="Ticket price" testid="rc-ticket">{inr2(r.ticket_price)}</Row>
            <Row label="Amount paid now" testid="rc-paid-amount">{inr2(r.amount_paid)}</Row>
            <Row label="Balance still to pay" testid="rc-balance">{inr2(r.balance)}</Row>
            <Row label="Payment reference" testid="rc-ref">{r.reference}</Row>
          </dl>
          <p className="text-xs text-stone-500 mt-4">
            This is a payment receipt. Your final invoice comes after the balance is paid in full.
          </p>
          <p className="text-xs text-stone-500 mt-1">Questions? Write to support@mypaxo.in.</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
