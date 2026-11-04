// Party Pool (customer side): the list of themed group parties, the detail page with live counters, and (Phase 2)
// joining, paying, top-ups, the balance and refunds.
// Counters come from the database function party_public(): PAID seats only, nothing about the venue deal or any other
// customer. A customer's own booking comes from party_my_booking(). Every amount shown here is computed again by the
// database when the payment is created, so a changed screen can never change what is charged.
import { useCallback, useEffect, useState } from "react";

const inr = (n) => Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = (n) => Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const fmtDay = (d) =>
  d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const fmtCloses = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

const STATUS_LABEL = { published: "Open to join", confirmed: "Party confirmed", closed: "Joining closed", completed: "Completed" };
const STATUS_TONE = {
  published: "bg-amber/15 text-amber border-amber/40",
  confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  closed: "bg-white/10 text-haze border-white/20",
  completed: "bg-white/10 text-haze border-white/20",
};

function StatusBadge({ party }) {
  const label = party.status === "published" && !party.joining_open ? STATUS_LABEL.closed : STATUS_LABEL[party.status] || party.status;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[party.status] || STATUS_TONE.closed}`} data-testid="party-status">{label}</span>;
}

// "X of 30 paid" with a progress bar; after confirmation, the seats left per gender instead of the split.
function Counter({ party }) {
  const need = party.min_paid_seats;
  const pct = Math.min(100, Math.round((party.paid_total / Math.max(need, 1)) * 100));
  const confirmed = party.status === "confirmed" || party.status === "completed";
  return (
    <div data-testid="party-counter">
      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className="text-ink font-semibold">
          <span data-testid="party-paid">{party.paid_total}</span> of {need} paid
        </span>
        {confirmed && <span className="text-xs text-emerald-400 font-medium">Party confirmed</span>}
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={Math.min(party.paid_total, need)} aria-label="Paid seats">
        <div className={`h-full rounded-full ${confirmed ? "bg-emerald-500" : "bg-amber"}`} style={{ width: `${pct}%` }} />
      </div>
      {confirmed ? (
        <p className="text-xs text-haze mt-1.5" data-testid="party-seats-left">
          Seats left: Male {party.male_left} · Female {party.female_left}
        </p>
      ) : (
        <p className="text-xs text-haze mt-1.5" data-testid="party-split">
          Paid so far: {party.paid_male} male · {party.paid_female} female
        </p>
      )}
    </div>
  );
}

// the two "type" facts of a party (package and liquor), shown as small badges and used for filtering
function TypeBadges({ party }) {
  const items = [party.package_type, party.liquor_type].filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2" data-testid="party-types">
      {items.map((t) => (
        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-ink border border-white/15">{t}</span>
      ))}
    </div>
  );
}
const seatsLeft = (p) => Math.max(Number(p.male_left || 0), 0) + Math.max(Number(p.female_left || 0), 0);

function Cover({ party, className }) {
  return (
    <div className={`relative bg-gradient-to-br from-surface to-[#2A1512] ${className}`}>
      {party.cover_photo_url && (
        <img src={party.cover_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
    </div>
  );
}

// ---- payment (one entry point for join, top-up and balance) ----------------------------------------------------------
// Asks the party-payment function to create the payment (the database checks every rule and holds the seats), opens
// Razorpay Checkout, then asks the function to verify. `kind` is "join" or "balance".
export async function startPartyPayment({ api, party, kind, genders, termsVersion, description, prefill, onDone, onError, onDismiss }) {
  try {
    if (!window.Razorpay) throw new Error("Payment library didn't load — please refresh and try again.");
    const order = await api.callFn("party-payment", api.session.token, {
      action: "create",
      party_id: party.id,
      kind,
      genders: kind === "join" ? genders : undefined,
      accept_terms: kind === "join" ? true : undefined,
      terms_version: kind === "join" ? termsVersion : undefined,
    });
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: "PAXO",
      description,
      prefill: prefill || {},
      theme: { color: "#F5A623" },
      handler: async (response) => {
        try {
          const result = await api.callFn("party-payment", api.session.token, {
            action: "verify",
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (result.verified) onDone(result);
          else onError(result.error || "We couldn't confirm that payment. Please try again.");
        } catch (err) {
          onError(err.message || "We couldn't confirm that payment. Please try again.");
        }
      },
      modal: { ondismiss: () => onDismiss && onDismiss() },
    });
    rzp.on("payment.failed", (resp) => onError(resp?.error?.description || "The payment didn't go through. Please try again."));
    rzp.open();
  } catch (err) {
    onError(err.message || "Could not start the payment. Please try again.");
  }
}

function useMyBooking(api, partyId) {
  const [mine, setMine] = useState(null);
  const reload = useCallback(async () => {
    if (!api?.session || !partyId) {
      setMine(null);
      return null;
    }
    try {
      const row = await api.sb("/rest/v1/rpc/party_my_booking", { method: "POST", token: api.session.token, body: { p_party_id: partyId } });
      setMine(row || null);
      return row || null;
    } catch (_e) {
      return null;
    }
  }, [api, partyId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [mine, reload];
}

function BalanceBox({ mine, busy, onPay, error }) {
  if (!mine) return null;
  const due = Number(mine.balance_due || 0);
  if (!(due > 0)) return null;
  return (
    <div className="mt-4 rounded-xl bg-amber/10 border border-amber/40 p-4 text-sm" data-testid="party-balance-box">
      <p className="text-ink font-semibold">Balance to pay: {inr2(due)}</p>
      {mine.balance_due_by && (
        <p className="text-haze mt-1">
          Pay by <span className="text-ink">{fmtCloses(mine.balance_due_by)}</span>. After that your seats are released and the deposit is not refunded.
        </p>
      )}
      {mine.can_pay_balance ? (
        <button type="button" onClick={onPay} disabled={busy} className="mt-3 rounded-full bg-amber text-[#170D0B] font-semibold px-5 py-2 disabled:opacity-60" data-testid="party-pay-balance">
          {busy ? "Opening payment…" : `Pay balance ${inr2(due)}`}
        </button>
      ) : (
        <p className="text-rose-400 mt-2">The balance deadline has passed.</p>
      )}
      {error && <p className="text-rose-400 mt-2" data-testid="party-pay-error">{error}</p>}
    </div>
  );
}

function MyBookingSummary({ mine }) {
  if (!mine) return null;
  if (mine.status === "forfeited") {
    return (
      <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm" data-testid="party-forfeited">
        <p className="text-ink font-semibold">Your seats were released</p>
        <p className="text-haze mt-1">The balance was not paid by the deadline. As per the terms, the deposit is not refunded.</p>
      </div>
    );
  }
  const refundDue = Number(mine.refund_due || 0);
  const refunded = Number(mine.refunded || 0);
  return (
    <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-mine">
      {mine.seats_paid > 0 && (
        <p className="text-ink font-semibold">
          Your seats: {mine.seats_paid} ({mine.male_paid} male · {mine.female_paid} female)
        </p>
      )}
      {Number(mine.paid_amount) > 0 && <p className="text-haze mt-1">Paid so far: {inr2(mine.paid_amount)}</p>}
      {refundDue > 0 && (
        <p className="text-amber mt-2" data-testid="party-refund-due">
          Refund of {inr2(refundDue)} on the way. Refund in 7 to 10 working days.
        </p>
      )}
      {refunded > 0 && (
        <p className="text-emerald-400 mt-2" data-testid="party-refunded">
          Refund of {inr2(refunded)} sent{mine.refunded_on ? ` on ${fmtDay(mine.refunded_on)}` : ""}.
        </p>
      )}
      {mine.seats_paid > 0 && refundDue === 0 && refunded === 0 && mine.status === "active" && (
        <p className="text-xs text-haze mt-2">There is no cancel option. The 30% deposit is non-refundable.</p>
      )}
    </div>
  );
}

function JoinBox({ party, mine, api, onNeedLogin, onChanged }) {
  const cap = Math.max(party.max_seats_per_booking - Number(mine?.seats_paid || 0), 0);
  const [people, setPeople] = useState([""]);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const confirmed = party.status === "confirmed";
  const chosenM = people.filter((g) => g === "male").length;
  const chosenF = people.filter((g) => g === "female").length;
  const complete = people.length >= 1 && people.every((g) => g === "male" || g === "female");
  const share = confirmed ? 1 : 0.3;
  const amount = Math.round(people.length * Number(party.price_per_person) * share * 100) / 100;

  function setCount(n) {
    const next = Math.min(Math.max(n, 1), Math.max(cap, 1));
    setPeople((p) => (next > p.length ? [...p, ...Array(next - p.length).fill("")] : p.slice(0, next)));
  }
  function pick(i, g) {
    setPeople((p) => p.map((x, j) => (j === i ? g : x)));
  }
  // a gender with no seats left (counting the other choices already made) cannot be chosen
  function disabledFor(i, g) {
    const others = people.filter((x, j) => j !== i && x === g).length;
    const left = g === "male" ? party.male_left : party.female_left;
    return left - others <= 0;
  }

  if (!api?.session) {
    return (
      <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-join-signin">
        <p className="text-ink">Sign in to join this party.</p>
        <button type="button" onClick={onNeedLogin} className="mt-3 rounded-full bg-amber text-[#170D0B] font-semibold px-5 py-2">Sign in</button>
      </div>
    );
  }
  if (cap <= 0) {
    return (
      <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-haze" data-testid="party-join-max">
        You already hold the maximum of {party.max_seats_per_booking} seats in this party.
      </div>
    );
  }
  if (party.male_left <= 0 && party.female_left <= 0) {
    return <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-haze" data-testid="party-full">All seats are taken right now. Seats held by other guests are released after 10 minutes if they do not pay, so check back soon.</div>;
  }

  async function pay() {
    setError("");
    setNotice("");
    setBusy(true);
    await startPartyPayment({
      api, party, kind: "join", genders: people, termsVersion: party.terms_version,
      description: `${mine?.seats_paid ? "Add seats" : "Seats"} — ${party.title}`,
      prefill: { email: api.session.email || "" },
      onDone: async (r) => {
        setBusy(false);
        setNotice(r.result === "paid" ? (r.party_confirmed ? "Payment received. The party is confirmed!" : "Payment received. Your seats are booked.") : "We got your payment, but the seats could not be kept. A full refund is on the way.");
        setPeople([""]);
        setAccept(false);
        await onChanged();
      },
      onError: async (m) => {
        setBusy(false);
        setError(m);
        await onChanged();
      },
      onDismiss: () => setBusy(false),
    });
  }

  return (
    <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-join-box">
      <p className="text-ink font-semibold">{mine?.seats_paid ? "Add more seats" : "Join this party"}</p>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-haze">Seats</span>
        <button type="button" aria-label="Fewer seats" onClick={() => setCount(people.length - 1)} disabled={people.length <= 1} className="w-8 h-8 rounded-full border border-white/20 disabled:opacity-40">−</button>
        <span className="text-ink font-semibold w-6 text-center" data-testid="party-seat-count">{people.length}</span>
        <button type="button" aria-label="More seats" onClick={() => setCount(people.length + 1)} disabled={people.length >= cap} className="w-8 h-8 rounded-full border border-white/20 disabled:opacity-40">+</button>
        <span className="text-xs text-haze">up to {cap}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {people.map((g, i) => (
          <div key={i} className="flex items-center gap-3" data-testid={`party-person-${i}`}>
            <span className="text-haze w-20">{i === 0 && !mine?.seats_paid ? "You" : `Guest ${i + 1}`}</span>
            {["male", "female"].map((opt) => {
              const dis = disabledFor(i, opt) && g !== opt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={dis}
                  onClick={() => pick(i, opt)}
                  data-testid={`party-person-${i}-${opt}`}
                  className={`px-3 py-1 rounded-full border capitalize ${g === opt ? "bg-amber text-[#170D0B] border-amber" : "border-white/20 text-ink"} ${dis ? "opacity-40 line-through" : ""}`}
                >
                  {opt}{dis ? " (full)" : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-haze mt-2">Choose male or female for every person. Seats left: Male {Math.max(party.male_left - chosenM, 0)} · Female {Math.max(party.female_left - chosenF, 0)}</p>

      <div className="mt-4 rounded-lg bg-black/20 p-3" data-testid="party-amount">
        {confirmed ? (
          <p className="text-ink">Pay now: <span className="font-semibold text-amber">{inr2(amount)}</span> <span className="text-haze">(100%, the party is confirmed)</span></p>
        ) : (
          <>
            <p className="text-ink">Pay now: <span className="font-semibold text-amber">{inr2(amount)}</span> <span className="text-haze">(30% deposit)</span></p>
            <p className="text-xs text-haze mt-1">The balance of {inr2(people.length * Number(party.price_per_person) - amount)} is due after the party is confirmed. The deposit is non-refundable.</p>
          </>
        )}
      </div>

      <label className="flex items-start gap-2 mt-3 text-haze cursor-pointer">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" data-testid="party-accept" />
        <span>I have read and accept the terms &amp; conditions (version {party.terms_version}) below.</span>
      </label>

      <button
        type="button"
        onClick={pay}
        disabled={busy || !complete || !accept}
        className="mt-4 rounded-full bg-amber text-[#170D0B] font-semibold px-6 py-2.5 disabled:opacity-50"
        data-testid="party-pay"
      >
        {busy ? "Opening payment…" : `Pay ${inr2(amount)}`}
      </button>
      <p className="text-xs text-haze mt-2">Your seats are held for 10 minutes while you pay.</p>
      {error && <p className="text-rose-400 mt-2" data-testid="party-pay-error">{error}</p>}
      {notice && <p className="text-emerald-400 mt-2" data-testid="party-pay-notice">{notice}</p>}
    </div>
  );
}

export function PartiesScreen({ parties, loading, error, onOpen, onRetry }) {
  const [city, setCity] = useState("all");
  const [type, setType] = useState("all");
  const cities = [...new Set(parties.map((p) => p.venue_city).filter(Boolean))].sort();
  const types = [...new Set(parties.flatMap((p) => [p.package_type, p.liquor_type]).filter(Boolean))].sort();
  const shown = parties.filter(
    (p) => (city === "all" || p.venue_city === city) && (type === "all" || p.package_type === type || p.liquor_type === type)
  );
  const chip = (active) =>
    `text-sm px-3 py-1.5 rounded-full border transition-colors ${active ? "bg-ink text-[#170D0B] border-ink" : "border-white/15 text-haze hover:text-ink"}`;
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-1">
        <span className="text-amber">Parties</span>
      </h1>
      <p className="text-haze text-sm mb-5">Themed group parties at top venues. Grab a seat and celebrate together.</p>

      {parties.length > 0 && (cities.length > 1 || types.length > 1) && (
        <div className="mb-6 flex flex-col gap-2" data-testid="party-filters">
          {cities.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(city === "all")} onClick={() => setCity("all")}>All cities</button>
              {cities.map((c) => (
                <button key={c} type="button" className={chip(city === c)} onClick={() => setCity(c)} data-testid={`party-city-${c}`}>{c}</button>
              ))}
            </div>
          )}
          {types.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(type === "all")} onClick={() => setType("all")}>All types</button>
              {types.map((t) => (
                <button key={t} type="button" className={chip(type === t)} onClick={() => setType(t)} data-testid={`party-type-${t}`}>{t}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="text-sm text-red-300">
          {error}{" "}
          <button className="underline" onClick={onRetry}>Try again</button>
        </div>
      ) : loading && parties.length === 0 ? (
        <p className="text-haze text-sm">Loading parties…</p>
      ) : parties.length === 0 ? (
        <p className="text-haze text-sm" data-testid="parties-empty">No parties are open right now. Check back soon.</p>
      ) : shown.length === 0 ? (
        <p className="text-haze text-sm" data-testid="parties-none-match">
          No parties match these filters.{" "}
          <button className="underline" onClick={() => { setCity("all"); setType("all"); }}>Clear filters</button>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              className="text-left rounded-2xl overflow-hidden bg-surface border border-white/10 hover:border-amber/50 transition-colors shadow-card"
              data-testid={`party-card-${p.id}`}
            >
              <Cover party={p} className="h-40" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-ink leading-tight">{p.title}</h3>
                  <StatusBadge party={p} />
                </div>
                <p className="text-sm text-haze mt-1">
                  {p.venue_name}
                  {p.venue_area || p.venue_city ? ` · ${[p.venue_area, p.venue_city].filter(Boolean).join(", ")}` : ""}
                </p>
                <p className="text-sm text-ink mt-2">
                  {fmtDay(p.party_date)} · {fmtTime(p.start_time)} – {fmtTime(p.end_time)}
                </p>
                <p className="text-amber font-semibold mt-1">
                  {inr(p.price_per_person)} <span className="text-haze font-normal text-xs">per person</span>
                </p>
                <TypeBadges party={p} />
                {p.joining_open && (
                  <p className="text-xs text-haze mt-2" data-testid="party-card-left">
                    {seatsLeft(p) > 0 ? `${seatsLeft(p)} seats left · joining closes ${fmtCloses(p.closes_at)}` : "All seats taken right now"}
                  </p>
                )}
                <div className="mt-3">
                  <Counter party={p} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// api = { session, sb, callFn } passed from the app (this file never imports the app)
export function PartyDetailScreen({ party, loading, onBack, api, onNeedLogin, onChanged }) {
  const [mine, reloadMine] = useMyBooking(api, party?.id);
  const [balBusy, setBalBusy] = useState(false);
  const [balError, setBalError] = useState("");

  if (!party) {
    return (
      <div>
        <button className="text-sm text-haze hover:text-ink mb-4" onClick={onBack}>← All parties</button>
        <p className="text-haze text-sm">{loading ? "Loading…" : "This party is no longer available."}</p>
      </div>
    );
  }
  const confirmed = party.status === "confirmed";
  const changed = async () => {
    await reloadMine();
    if (onChanged) await onChanged();
  };
  async function payBalance() {
    setBalError("");
    setBalBusy(true);
    await startPartyPayment({
      api, party, kind: "balance", description: `Balance — ${party.title}`,
      prefill: { email: api.session?.email || "" },
      onDone: async () => { setBalBusy(false); await changed(); },
      onError: async (m) => { setBalBusy(false); setBalError(m); await changed(); },
      onDismiss: () => setBalBusy(false),
    });
  }
  const blocked = mine && mine.status !== "active";

  return (
    <div className="max-w-xl mx-auto" data-testid="party-detail">
      <button className="text-sm text-haze hover:text-ink mb-4" onClick={onBack}>← All parties</button>
      <div className="rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-card">
        <Cover party={party} className={party.cover_photo_url ? "h-48" : "h-24"} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">{party.title}</h1>
            <StatusBadge party={party} />
          </div>
          <p className="text-sm text-haze mt-1">
            {party.venue_name}
            {party.venue_area || party.venue_city ? ` · ${[party.venue_area, party.venue_city].filter(Boolean).join(", ")}` : ""}
          </p>

          <TypeBadges party={party} />

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-haze">Date</dt>
              <dd className="text-ink">{fmtDay(party.party_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-haze">Time</dt>
              <dd className="text-ink">{fmtTime(party.start_time)} – {fmtTime(party.end_time)}</dd>
            </div>
            <div>
              <dt className="text-xs text-haze">Price</dt>
              <dd className="text-amber font-semibold">{inr(party.price_per_person)} <span className="text-haze font-normal text-xs">per person</span></dd>
            </div>
            <div>
              <dt className="text-xs text-haze">City</dt>
              <dd className="text-ink">{party.venue_city || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-haze">Joining closes</dt>
              <dd className="text-ink">{fmtCloses(party.closes_at)}</dd>
            </div>
          </dl>

          {party.description && <p className="text-ink/90 text-sm mt-4 whitespace-pre-line">{party.description}</p>}

          <div className="mt-5 pt-4 border-t border-white/10">
            <Counter party={party} />
            {!confirmed && party.status === "published" && party.joining_open && (
              <p className="text-xs text-haze mt-2">The party is confirmed once {party.min_paid_seats} seats are paid.</p>
            )}
          </div>

          <MyBookingSummary mine={mine} />
          {!blocked && <BalanceBox mine={mine} busy={balBusy} onPay={payBalance} error={balError} />}

          {party.joining_open && !blocked ? (
            <JoinBox key={`${party.id}-${mine?.seats_paid || 0}`} party={party} mine={mine} api={api} onNeedLogin={onNeedLogin} onChanged={changed} />
          ) : (
            <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-join-note">
              {blocked ? (
                <p className="text-haze">You can no longer join this party.</p>
              ) : party.status === "completed" ? (
                <p className="text-haze">This party has ended.</p>
              ) : (
                <p className="text-haze">Joining is closed for this party.</p>
              )}
            </div>
          )}

          <p className="text-xs text-haze mt-4" data-testid="party-provider">Services are provided by {party.venue_name}.</p>
          <p className="text-xs text-haze mt-1" data-testid="party-alcohol">Guests confirm that they are eligible to be served alcohol.</p>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-amber font-medium">Terms & conditions (version {party.terms_version})</summary>
            <p className="mt-2 text-xs text-haze whitespace-pre-line" data-testid="party-terms">{party.terms_text}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

// "My bookings" section for parties: own seats, balance (with a Pay balance button), refund status.
export function PartyBookingsSection({ api, onOpenParty, refreshKey }) {
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({});
  const load = useCallback(async () => {
    if (!api?.session) return;
    try {
      const rows = await api.sb("/rest/v1/rpc/party_my_bookings", { method: "POST", token: api.session.token, body: {} });
      setItems(rows || []);
    } catch (_e) {
      setItems([]);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  if (!items || items.length === 0) return null;

  async function payBalance(it) {
    setErrors((e) => ({ ...e, [it.party_id]: "" }));
    setBusyId(it.party_id);
    await startPartyPayment({
      api, party: { id: it.party_id }, kind: "balance", description: `Balance — ${it.title}`,
      prefill: { email: api.session?.email || "" },
      onDone: async () => { setBusyId(null); await load(); },
      onError: async (m) => { setBusyId(null); setErrors((e) => ({ ...e, [it.party_id]: m })); await load(); },
      onDismiss: () => setBusyId(null),
    });
  }

  return (
    <div className="mb-8" data-testid="party-bookings">
      <h2 className="font-display text-xl font-semibold mb-3">Party bookings</h2>
      <div className="flex flex-col gap-3">
        {items.map((it) => {
          const b = it.booking || {};
          const due = Number(b.balance_due || 0);
          return (
            <div key={it.party_id} className="rounded-2xl bg-surface border border-white/10 p-4 text-sm" data-testid={`party-booking-${it.party_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-ink font-semibold">{it.title}</p>
                  <p className="text-haze">{it.venue_name} · {fmtDay(it.party_date)} · {fmtTime(it.start_time)}</p>
                </div>
                <button type="button" className="text-amber text-xs underline shrink-0" onClick={() => onOpenParty(it.party_id)}>View</button>
              </div>
              {b.status === "forfeited" ? (
                <p className="text-rose-400 mt-2">Seats released: the balance was not paid on time. The deposit is not refunded.</p>
              ) : (
                <>
                  {b.seats_paid > 0 && <p className="text-ink mt-2">{b.seats_paid} seats ({b.male_paid} male · {b.female_paid} female) · paid {inr2(b.paid_amount)}</p>}
                  {Number(b.refund_due) > 0 && <p className="text-amber mt-1">Refund of {inr2(b.refund_due)} on the way. Refund in 7 to 10 working days.</p>}
                  {Number(b.refunded) > 0 && <p className="text-emerald-400 mt-1">Refund of {inr2(b.refunded)} sent{b.refunded_on ? ` on ${fmtDay(b.refunded_on)}` : ""}.</p>}
                  {due > 0 && (
                    <div className="mt-2">
                      <p className="text-ink">Balance: <span className="font-semibold text-amber">{inr2(due)}</span>{b.balance_due_by ? <span className="text-haze"> · pay by {fmtCloses(b.balance_due_by)}</span> : null}</p>
                      {b.can_pay_balance && (
                        <button type="button" onClick={() => payBalance(it)} disabled={busyId === it.party_id} className="mt-2 rounded-full bg-amber text-[#170D0B] font-semibold px-5 py-2 disabled:opacity-60" data-testid={`party-pay-balance-${it.party_id}`}>
                          {busyId === it.party_id ? "Opening payment…" : `Pay balance ${inr2(due)}`}
                        </button>
                      )}
                    </div>
                  )}
                  {errors[it.party_id] && <p className="text-rose-400 mt-2">{errors[it.party_id]}</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
