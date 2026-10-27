import { useState, useEffect } from "react";

// "Find my venue": the customer leaves a few details and the PAXO team calls back. Works signed out as well as signed in.
// The details go to the submit-lead edge function (saved as a lead, founder emailed). Nothing is stored in the browser.
const SUPABASE_URL = "https://cjjksssylejwxwbalury.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamtzc3N5bGVqd3h3YmFsdXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0OTQ4MzEsImV4cCI6MjEwNDA3MDgzMX0.H2PkT7nkoXFDc2vBOM2lRNlih0xDUZyk9Sft1MqRzTI";

// Today's date in India, as YYYY-MM-DD (the earliest party date we accept).
export const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// 10-digit Indian mobile from whatever the customer typed (+91, 0, spaces, dashes). Returns "" when it is not one.
export function cleanPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
}

export function validateLead(f) {
  if (f.name.trim().length < 2) return "Please enter your name.";
  if (!cleanPhone(f.phone)) return "Please enter a valid 10-digit mobile number.";
  if (f.location.trim().length < 2) return "Please tell us the area or city you are looking at.";
  if (!f.party_date) return "Please choose your party date.";
  if (f.party_date < todayIST()) return "The party date cannot be in the past.";
  const g = Number(f.guests);
  if (!Number.isInteger(g) || g < 1 || g > 5000) return "Please enter the number of guests (MG) as a whole number.";
  return "";
}

const inputCls = "border border-white/15 bg-white/[0.04] text-ink rounded-lg px-3 py-2 text-sm w-full placeholder:text-haze/50";

// Module-level on purpose (a component defined inside another loses focus on every keystroke).
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function LeadForm({ session, profile, onClose, onOpenQuiz }) {
  const [f, setF] = useState({
    name: profile?.full_name || "",
    phone: profile?.phone || "",
    location: "",
    party_date: "",
    guests: "",
    company: "", // honeypot: real people never see or fill it
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    const problem = validateLead(f);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-lead`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${session?.token || ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(),
          phone: cleanPhone(f.phone),
          location: f.location.trim(),
          party_date: f.party_date,
          guests: Number(f.guests),
          company: f.company,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Find my venue"
      data-testid="lead-form"
    >
      <div
        className="bg-surface text-ink rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-hero border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="font-display font-semibold">Find my venue</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-haze hover:text-ink hover:bg-white/10 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {done ? (
            <div className="text-center py-6" data-testid="lead-done">
              <p className="font-display text-xl font-semibold text-amber mb-2">Thank you!</p>
              <p className="text-sm text-haze mb-5">We have your details. Our team will call you shortly to help you find the right venue.</p>
              <button onClick={onClose} className="bg-amber text-[#170D0B] font-semibold rounded-xl px-5 py-2.5 text-sm">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
              <p className="text-sm text-haze">Share a few details and our team will call you to find the right venue for your party.</p>
              <Field label="Your name">
                <input value={f.name} onChange={set("name")} autoComplete="name" maxLength={120} className={inputCls} placeholder="Full name" />
              </Field>
              <Field label="Contact number">
                <input
                  value={f.phone}
                  onChange={set("phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  className={inputCls}
                  placeholder="10-digit mobile number"
                />
              </Field>
              <Field label="Location">
                <input value={f.location} onChange={set("location")} maxLength={200} className={inputCls} placeholder="Area or city, e.g. Gurugram" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Party date">
                  <input value={f.party_date} onChange={set("party_date")} type="date" min={todayIST()} className={inputCls} />
                </Field>
                <Field label="Guests (MG)">
                  <input
                    value={f.guests}
                    onChange={set("guests")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5000}
                    className={inputCls}
                    placeholder="e.g. 40"
                  />
                </Field>
              </div>
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Company
                  <input value={f.company} onChange={set("company")} tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              {error && (
                <p className="text-red-300 text-sm" role="alert" data-testid="lead-error">
                  {error}
                </p>
              )}
              <button disabled={busy} className="bg-amber text-[#170D0B] font-semibold rounded-xl px-5 py-2.5 text-sm disabled:opacity-50 hover:brightness-110 transition">
                {busy ? "Sending…" : "Request a call back"}
              </button>
              <p className="text-xs text-haze/70">By submitting, you agree that PAXO may call or message you about this enquiry.</p>
              {onOpenQuiz && (
                <button type="button" onClick={onOpenQuiz} className="text-xs text-haze underline self-start hover:text-ink">
                  Prefer to browse? Take the quick venue quiz instead
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
