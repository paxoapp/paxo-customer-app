import { useState, useEffect, useCallback, useRef } from "react";

// Party page: menu voting for guests with a paid seat, and the final menu once PAXO has locked it.
// Everything comes from database functions: a guest only ever gets their own vote plus aggregate bars, never who voted.
// api = { session, sb, callFn } passed from the app.

const CATEGORY_LABEL = {
  starter_veg: "Starters (Veg)",
  starter_non_veg: "Starters (Non-veg)",
  main_veg: "Main course (Veg)",
  main_non_veg: "Main course (Non-veg)",
  dessert: "Dessert",
  drinks: "Drinks",
};
const fmtAt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const rpcCall = (api, fn, body) => api.sb(`/rest/v1/rpc/${fn}`, { method: "POST", token: api.session?.token, body });

function VoteCategory({ c, canVote, busy, onVote }) {
  const any = c.my_choice === "any";
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3" data-testid={`vote-cat-${c.category}`}>
      <p className="text-ink text-sm font-semibold">
        {CATEGORY_LABEL[c.category] || c.category} <span className="text-haze font-normal text-xs">· {c.winners} served</span>
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {c.options.map((o) => {
          const mine = c.my_choice === o.id;
          return (
            <button key={o.id} type="button" disabled={!canVote || busy} onClick={() => onVote(c.category, o.id)} data-testid={`vote-opt-${o.label}`}
              className={`relative overflow-hidden text-left rounded-lg border px-3 py-2 text-sm ${mine ? "border-amber bg-amber/10" : "border-white/10"} ${canVote ? "" : "cursor-default"}`}>
              <span className="absolute inset-y-0 left-0 bg-amber/20" style={{ width: `${Math.min(100, Number(o.pct || 0))}%` }} data-testid={`vote-bar-${o.label}`} />
              <span className="relative flex justify-between gap-3">
                <span className="text-ink">{mine ? "✓ " : ""}{o.label}</span>
                <span className="text-haze text-xs shrink-0">{Number(o.pct || 0)}%</span>
              </span>
            </button>
          );
        })}
        {canVote && (
          <button type="button" disabled={busy} onClick={() => onVote(c.category, null)} data-testid={`vote-any-${c.category}`}
            className={`text-left rounded-lg border px-3 py-2 text-sm ${any ? "border-amber bg-amber/10 text-ink" : "border-white/10 text-haze"}`}>
            {any ? "✓ " : ""}Anything is fine
          </button>
        )}
      </div>
    </div>
  );
}

export function PartyMenuSection({ party, api }) {
  const [v, setV] = useState(null);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = !!api?.session;

  const apiRef = useRef(api);
  apiRef.current = api;
  const token = api?.session?.token || null;
  const load = useCallback(async () => {
    try {
      const [voting, fin] = await Promise.all([rpcCall(apiRef.current, "party_menu_voting", { p_party_id: party.id }), rpcCall(apiRef.current, "party_menu_final", { p_party_id: party.id })]);
      setV(voting);
      setFinal(fin);
    } catch (_e) {
      setV(null);
    }
  }, [token, party.id]);
  useEffect(() => {
    load();
  }, [load, signedIn]);

  if (!v || !v.configured) return null;

  if (v.locked && final) {
    return (
      <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-final-menu">
        <p className="text-ink font-semibold mb-2">The menu for this party</p>
        {final.map((c) => (
          <div key={c.category} className="mb-2">
            <p className="text-xs text-haze">{CATEGORY_LABEL[c.category] || c.category}</p>
            {c.items.length ? <ul className="text-ink">{c.items.map((it) => <li key={it}>• {it}</li>)}</ul> : <p className="text-haze">The venue's choice</p>}
          </div>
        ))}
      </div>
    );
  }

  async function vote(category, optionId) {
    setBusy(true);
    setError("");
    try {
      const res = await rpcCall(api, "party_cast_vote", { p_party_id: party.id, p_category: category, p_option_id: optionId });
      setV(res);
    } catch (e) {
      setError(e.message || "Could not save your vote.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (v.my_seats === 0) {
    return (
      <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-4 text-sm" data-testid="party-menu-info">
        <p className="text-ink font-semibold">Menu vote</p>
        <p className="text-haze mt-1">Guests with a paid seat choose the menu together. Voting closes {fmtAt(v.closes_at)}.</p>
      </div>
    );
  }

  return (
    <div className="mt-5" data-testid="party-vote">
      <p className="text-ink font-semibold">Vote on the menu</p>
      <p className="text-haze text-xs mt-1">
        Your booking counts as {v.my_seats} vote{v.my_seats > 1 ? "s" : ""} in each category. {v.can_vote ? `You can change your votes until ${fmtAt(v.closes_at)}.` : "Voting is closed."} Nobody can see who voted.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {v.categories.map((c) => <VoteCategory key={c.category} c={c} canVote={v.can_vote} busy={busy} onVote={vote} />)}
      </div>
      {error && <p className="text-rose-400 text-sm mt-2" data-testid="party-vote-error">{error}</p>}
    </div>
  );
}

// "My invoices" for party bookings: only the signed-in customer's own, data only (no PDF yet).
export function PartyInvoicesSection({ api, refreshKey }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!api?.session) return;
    rpcCall(api, "party_my_invoices", {}).then((r) => setRows(r || [])).catch(() => setRows([]));
  }, [api, refreshKey]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="mb-8" data-testid="party-invoices">
      <h2 className="font-display text-xl font-semibold mb-3">Party invoices</h2>
      <div className="flex flex-col gap-2">
        {rows.map((i) => (
          <div key={i.id} className="rounded-2xl bg-surface border border-white/10 p-4 text-sm flex justify-between gap-3" data-testid={`party-invoice-${i.invoice_no}`}>
            <div>
              <p className="text-ink font-semibold">{i.invoice_no}{i.status === "void" ? " (void)" : ""}</p>
              <p className="text-haze">{i.party_title} · {i.venue_name}</p>
              <p className="text-haze text-xs">{i.seats} seats · issued {new Date(i.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
            </div>
            <p className="text-amber font-semibold shrink-0">₹{Number(i.amount_paid).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
