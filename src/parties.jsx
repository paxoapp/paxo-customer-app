// Party Pool (customer side, Phase 1): the list of themed group parties and the detail page, with live counters.
// Everything comes from the database function party_public(): PAID seats only, no seeded numbers, nothing about the
// venue deal or any other customer. There is no joining or payment here yet.

const inr = (n) => Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

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

export function PartiesScreen({ parties, loading, error, onOpen, onRetry }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-1">
        <span className="text-amber">Parties</span>
      </h1>
      <p className="text-haze text-sm mb-6">Themed group parties at top venues. Grab a seat and celebrate together.</p>

      {error ? (
        <div className="text-sm text-red-300">
          {error}{" "}
          <button className="underline" onClick={onRetry}>Try again</button>
        </div>
      ) : loading && parties.length === 0 ? (
        <p className="text-haze text-sm">Loading parties…</p>
      ) : parties.length === 0 ? (
        <p className="text-haze text-sm" data-testid="parties-empty">No parties are open right now. Check back soon.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {parties.map((p) => (
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

export function PartyDetailScreen({ party, loading, onBack }) {
  if (!party) {
    return (
      <div>
        <button className="text-sm text-haze hover:text-ink mb-4" onClick={onBack}>← All parties</button>
        <p className="text-haze text-sm">{loading ? "Loading…" : "This party is no longer available."}</p>
      </div>
    );
  }
  const confirmed = party.status === "confirmed";
  return (
    <div className="max-w-2xl" data-testid="party-detail">
      <button className="text-sm text-haze hover:text-ink mb-4" onClick={onBack}>← All parties</button>
      <div className="rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-card">
        <Cover party={party} className="h-56" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-ink leading-tight">{party.title}</h1>
            <StatusBadge party={party} />
          </div>
          <p className="text-sm text-haze mt-1">
            {party.venue_name}
            {party.venue_area || party.venue_city ? ` · ${[party.venue_area, party.venue_city].filter(Boolean).join(", ")}` : ""}
          </p>

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
            {party.package_type && (
              <div>
                <dt className="text-xs text-haze">Package</dt>
                <dd className="text-ink">{party.package_type}</dd>
              </div>
            )}
            {party.liquor_type && (
              <div>
                <dt className="text-xs text-haze">Liquor</dt>
                <dd className="text-ink">{party.liquor_type}</dd>
              </div>
            )}
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

          <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-join-note">
            {party.joining_open ? (
              <p className="text-ink">Booking seats opens soon. Check back here.</p>
            ) : party.status === "completed" ? (
              <p className="text-haze">This party has ended.</p>
            ) : (
              <p className="text-haze">Joining is closed for this party.</p>
            )}
          </div>

          <p className="text-xs text-haze mt-4" data-testid="party-provider">Services are provided by {party.venue_name}.</p>
          <p className="text-xs text-haze mt-1" data-testid="party-alcohol">Guests confirm that they are eligible to be served alcohol.</p>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-amber font-medium">Terms & conditions</summary>
            <p className="mt-2 text-xs text-haze whitespace-pre-line" data-testid="party-terms">{party.terms_text}</p>
          </details>
        </div>
      </div>
    </div>
  );
}
