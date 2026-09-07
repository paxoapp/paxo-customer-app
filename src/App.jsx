import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, CalendarCheck, User } from "lucide-react";

const SUPABASE_URL = "https://cjjksssylejwxwbalury.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamtzc3N5bGVqd3h3YmFsdXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0OTQ4MzEsImV4cCI6MjEwNDA3MDgzMX0.H2PkT7nkoXFDc2vBOM2lRNlih0xDUZyk9Sft1MqRzTI";

async function sb(path, { method = "GET", body, token, prefer } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers["Prefer"] = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.msg || data?.error_description || "Something went wrong";
    throw new Error(message);
  }
  return data;
}

// Call a Supabase Edge Function with the user's session JWT.
async function callFn(slug, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.text().then((t) => (t ? JSON.parse(t) : {}));
  if (!res.ok) throw new Error(data.error || data.details || "Something went wrong");
  return data;
}

function hoursUntil(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const target = new Date(`${dateStr}T${timeStr}`);
  return (target.getTime() - Date.now()) / (1000 * 60 * 60);
}

function depositPreview(headcount, hrsToEvent) {
  if (hrsToEvent !== null && hrsToEvent < 72) {
    return {
      tier: "Full payment",
      pct: 1,
      bookingCategory: "Express Booking",
      reason:
        "Your event is less than 72 hours away, so this is booked as an Express Booking — full payment is required upfront because the venue has very little lead time to prepare.",
    };
  }
  if (headcount <= 100) {
    return {
      tier: "20% deposit",
      pct: 0.2,
      bookingCategory: "Advance Booking",
      reason:
        "This is an Advance Booking for up to 100 guests, so only a 20% deposit is needed now to secure the venue — the remaining balance is paid directly to the venue at the event.",
    };
  }
  if (headcount <= 300) {
    return {
      tier: "50% deposit",
      pct: 0.5,
      bookingCategory: "Advance Booking",
      reason:
        "This is an Advance Booking for 101–300 guests, so a 50% deposit is needed now to secure the venue — the remaining balance is paid directly to the venue at the event.",
    };
  }
  return {
    tier: "Full payment",
    pct: 1,
    bookingCategory: "Advance Booking",
    reason:
      "This is an Advance Booking for 300+ guests, so full payment is required upfront given the size of the event.",
  };
}

const inr = (n) =>
  n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// Label-only GST view. `price_per_head` is authoritative and never changes — for
// "included" packages we just break the amount into base + GST for transparency
// (18% when the package has alcohol, 5% for food-only, CA-confirmed). "excluded"
// packages cost exactly the same; GST simply isn't itemised here.
const gstRateFor = (pkg) => (pkg?.includes_alcohol ? 0.18 : 0.05);
function gstSplit(amount, pkg) {
  const rate = gstRateFor(pkg);
  const base = Math.round((amount / (1 + rate)) * 100) / 100;
  return { rate, pct: Math.round(rate * 100), base, gst: Math.round((amount - base) * 100) / 100 };
}

// Compact GST breakdown line for a per-head package price.
function GstLine({ pkg, className = "text-xs text-haze/80" }) {
  const price = Number(pkg?.price_per_head || 0);
  if (!price) return null;
  if (pkg?.gst_mode === "excluded") {
    return (
      <p className={className}>
        {inr(price)}/head is exclusive of GST — the total you pay is unchanged.
      </p>
    );
  }
  const { pct, base, gst } = gstSplit(price, pkg);
  return (
    <p className={className}>
      Incl. GST: {inr(base)} base + {inr(gst)} GST ({pct}%) = {inr(price)}/head
    </p>
  );
}

// [singular, plural] per quota category kind.
const QUOTA_LABELS = {
  starter_veg: ["Veg Starter", "Veg Starters"],
  starter_non_veg: ["Non-Veg Starter", "Non-Veg Starters"],
  main_veg: ["Veg Main Course", "Veg Main Courses"],
  main_non_veg: ["Non-Veg Main Course", "Non-Veg Main Courses"],
  dessert: ["Dessert", "Desserts"],
  wine: ["Wine", "Wines"],
  beer: ["Beer", "Beers"],
  whisky: ["Whisky", "Whiskies"],
  vodka: ["Vodka", "Vodkas"],
  rum: ["Rum", "Rums"],
  gin: ["Gin", "Gins"],
  classic_cocktails: ["Classic Cocktail", "Classic Cocktails"],
  mocktails: ["Mocktail", "Mocktails"],
  soft_beverages: ["Soft Beverage", "Soft Beverages"],
  single_malt: ["Single Malt", "Single Malts"],
  side: ["Side", "Sides"],
  other: ["Other", "Other"],
  // legacy kinds, kept for older packages
  beverage_alcohol: ["Alcoholic Beverage", "Alcoholic Beverages"],
  beverage_non_alcohol: ["Non-Alcoholic Beverage", "Non-Alcoholic Beverages"],
};

function quotaLabel(kind, count) {
  const pair = QUOTA_LABELS[kind];
  if (!pair) return kind;
  return count === 1 ? pair[0] : pair[1];
}

const FOOD_QUOTA_KINDS = [
  "starter_veg",
  "starter_non_veg",
  "main_veg",
  "main_non_veg",
  "side",
  "dessert",
];
// Hard-liquor categories where a package restricts choice to a specific brand pool.
const POOL_QUOTA_KINDS = ["single_malt", "whisky", "vodka", "gin", "rum", "beer", "wine"];

// Lowest price among a venue's published packages (RLS only returns published
// packages to customers), or null if it has none.
function minPackagePrice(venue) {
  const prices = (venue?.venue_packages || []).map((p) => Number(p.price_per_head));
  return prices.length ? Math.min(...prices) : null;
}

// Shared modal shell — same close affordances as the admin doc viewer:
// the X button, the Esc key, and a click on the backdrop.
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="modal-card bg-surface text-ink rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-hero border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="font-display font-semibold">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-haze hover:text-ink hover:bg-white/10 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="modal-scroll flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// Custom dropdown that renders its option list as themed DOM instead of the
// browser/OS native <select> popup (which shows illegible pale-on-white text and,
// on mobile, an OS picker we can't style). Same value contract as a native
// <select>: `value` is a string, `onChange` receives the chosen option's value.
// `options` is [{ value, label }]. Keyboard: ↑/↓/Home/End move, Enter selects,
// Esc closes; closes on outside click or selection.
function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  wrapperClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : options[0]?.label ?? "Select";

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cur = options.findIndex((o) => o.value === value);
    setActiveIdx(cur >= 0 ? cur : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(idx) {
    const opt = options[idx];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIdx);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${wrapperClassName}`}>
      {/* role=button div rather than <button>: a native button synthesizes a
          click on Enter/Space, which would fight the keydown handler below. */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer select-none`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={selected && selected.value ? "" : "text-haze/60"}>{label}</span>
        <span aria-hidden className="text-haze pointer-events-none leading-none">▾</span>
      </div>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-50 mt-1 max-h-60 min-w-full w-max max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-white/15 bg-surface py-1 shadow-hero"
        >
          {options.map((o, i) => (
            <li
              key={o.value === "" ? "__empty__" : o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIdx
                  ? "bg-amber text-[#170D0B]"
                  : o.value === value
                  ? "text-amber"
                  : "text-ink"
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Read-only pre-purchase menu view for one package.
function ReviewMenuBody({ pkg, venue }) {
  const cats = venue?.menu_categories || [];
  const itemsForKind = (kind) =>
    cats
      .filter((c) => c.kind === kind)
      .flatMap((c) => c.menu_items || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  const quotaFor = (kind) =>
    pkg.menu_quota_rules?.find((q) => q.category_kind === kind)?.quota_count;
  const poolIds = new Set((pkg.package_item_pool || []).map((r) => r.menu_item_id));

  const foodKinds = FOOD_QUOTA_KINDS.filter((k) => quotaFor(k));
  const drinkKinds = POOL_QUOTA_KINDS.filter((k) => quotaFor(k));
  const terms = (venue?.terms_and_conditions || "").trim();

  const ItemList = ({ items }) =>
    items.length ? (
      <ul className="list-disc pl-5 text-sm text-haze flex flex-col gap-0.5">
        {items.map((it) => (
          <li key={it.id} className={it.is_available ? "" : "opacity-50"}>
            {it.name}
            {!it.is_available && " (currently unavailable)"}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-haze/70">No items listed yet.</p>
    );

  const Group = ({ kind, items }) => (
    <div className="mb-3 last:mb-0">
      <p className="text-sm font-medium text-ink mb-1">
        Choose <span className="text-amber font-semibold">{quotaFor(kind)}</span>{" "}
        {quotaLabel(kind, quotaFor(kind))}
      </p>
      <ItemList items={items} />
    </div>
  );

  const nothing =
    foodKinds.length === 0 && drinkKinds.length === 0 && !pkg.inclusions?.length;

  return (
    <div>
      {Number(pkg?.price_per_head) > 0 && (
        <div className="mb-5">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Pricing</h3>
          <p className="text-sm text-ink font-medium">{inr(pkg.price_per_head)} / head</p>
          <GstLine pkg={pkg} className="text-xs text-haze/80 mt-1" />
        </div>
      )}

      {foodKinds.length > 0 && (
        <div className="mb-5">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Food</h3>
          <ul className="flex flex-col gap-1 text-sm text-ink">
            {foodKinds.map((k) => (
              <li key={k}>
                Choose <span className="text-amber font-semibold">{quotaFor(k)}</span>{" "}
                {quotaLabel(k, quotaFor(k))}
              </li>
            ))}
          </ul>
          <p className="text-xs text-haze/80 mt-2">
            You'll pick your exact dishes after booking, in Finalize Your Menu.
          </p>
        </div>
      )}

      {drinkKinds.length > 0 && (
        <div className="mb-5">
          <h3 className="font-display text-base font-semibold text-ink mb-2">
            Drinks included in this package
          </h3>
          {drinkKinds.map((k) => (
            <Group key={k} kind={k} items={itemsForKind(k).filter((it) => poolIds.has(it.id))} />
          ))}
        </div>
      )}

      {pkg.inclusions?.length > 0 && (
        <div className="mb-5 last:mb-0">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Also included</h3>
          <ul className="list-disc pl-5 text-sm text-haze flex flex-col gap-0.5">
            {pkg.inclusions.map((inc, i) => (
              <li key={i}>{inc}</li>
            ))}
          </ul>
        </div>
      )}

      {terms && (
        <div className="mb-5 last:mb-0">
          <h3 className="font-display text-base font-semibold text-ink mb-2">
            Terms &amp; Conditions
          </h3>
          <p className="text-sm text-haze whitespace-pre-wrap">{terms}</p>
        </div>
      )}

      {nothing && !terms && (
        <p className="text-sm text-haze/70">No menu details for this package yet.</p>
      )}
    </div>
  );
}

// Venue-wide "what does this place serve" browsing — no package attribution or
// quotas (those live in each package's own Review Menu).
const FOOD_MENU_SECTIONS = [
  { kind: "starter_veg", label: "Veg Starters" },
  { kind: "starter_non_veg", label: "Non-Veg Starters" },
  { kind: "main_veg", label: "Veg Main Courses" },
  { kind: "main_non_veg", label: "Non-Veg Main Courses" },
  { kind: "side", label: "Sides" },
  { kind: "dessert", label: "Dessert" },
];
const BEVERAGE_MENU_SECTIONS = [
  { kind: "single_malt", label: "Single Malt" },
  { kind: "whisky", label: "Whisky" },
  { kind: "vodka", label: "Vodka" },
  { kind: "gin", label: "Gin" },
  { kind: "rum", label: "Rum" },
  { kind: "beer", label: "Beer" },
  { kind: "wine", label: "Wine" },
];
// Free-text inclusion lines worth surfacing under "Also available".
const SOFT_DRINK_INCLUSION_RE = /cocktail|mocktail|soft/i;

function VenueFullMenu({ venue }) {
  const [tab, setTab] = useState("food");
  const [expanded, setExpanded] = useState(false);
  const cats = venue?.menu_categories || [];
  const packages = venue?.venue_packages || [];

  const byName = (a, b) => a.localeCompare(b);
  const itemsOfKind = (kind) =>
    cats.filter((c) => c.kind === kind).flatMap((c) => c.menu_items || []);

  // Every available dish of a kind, names only.
  const foodNames = (kind) =>
    itemsOfKind(kind)
      .filter((it) => it.is_available)
      .map((it) => it.name)
      .sort(byName);

  // Deduplicated union of every brand pooled by ANY of this venue's packages.
  const pooledIds = new Set(
    packages.flatMap((p) => (p.package_item_pool || []).map((r) => r.menu_item_id))
  );
  const brandNames = (kind) => {
    const seen = new Set();
    return itemsOfKind(kind)
      .filter((it) => pooledIds.has(it.id) && !seen.has(it.id) && seen.add(it.id))
      .map((it) => it.name)
      .sort(byName);
  };

  const alsoAvailable = [
    ...new Set(
      packages
        .flatMap((p) => p.inclusions || [])
        .map((line) => (line || "").trim())
        .filter((line) => line && SOFT_DRINK_INCLUSION_RE.test(line))
    ),
  ];

  const hasPackages = packages.length > 0;
  const foodSections = FOOD_MENU_SECTIONS.map((s) => ({
    ...s,
    items: foodNames(s.kind),
  })).filter((s) => s.items.length);
  const bevSections = BEVERAGE_MENU_SECTIONS.map((s) => ({
    ...s,
    items: brandNames(s.kind),
  })).filter((s) => s.items.length);

  const Section = ({ label, items }) => (
    <div>
      <p className="text-sm font-semibold text-ink mb-1">{label}</p>
      <ul className="list-disc pl-5 text-sm text-haze flex flex-col gap-0.5">
        {items.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="rounded-2xl bg-surface border border-white/10 shadow-card overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-display text-base font-semibold text-ink">View full menu</span>
        <span aria-hidden className="text-lg leading-none text-haze w-5 text-center shrink-0">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10">
          <p className="text-sm text-haze px-4 pt-3">
            Everything this venue serves. Package-specific choices and quotas are shown on each
            package's “Review menu”.
          </p>

          {!hasPackages ? (
            <p className="text-sm text-haze/70 p-4">Menu details coming soon.</p>
          ) : (
            <>
              <div className="flex border-b border-white/10 mt-3">
                {[
                  ["food", "Food Menu"],
                  ["beverages", "Beverages"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`flex-1 text-sm font-medium py-2.5 transition-colors ${
                      tab === k
                        ? "text-amber border-b-2 border-amber"
                        : "text-haze hover:text-ink border-b-2 border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {tab === "food" &&
                  (foodSections.length ? (
                    <div className="flex flex-col gap-4">
                      {foodSections.map((s) => (
                        <Section key={s.kind} label={s.label} items={s.items} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-haze/70">Food menu coming soon.</p>
                  ))}
                {tab === "beverages" &&
                  (bevSections.length || alsoAvailable.length ? (
                    <div className="flex flex-col gap-4">
                      {bevSections.map((s) => (
                        <Section key={s.kind} label={s.label} items={s.items} />
                      ))}
                      {alsoAvailable.length > 0 && (
                        <div className="border-t border-white/10 pt-3">
                          <Section label="Also available" items={alsoAvailable} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-haze/70">Beverage details coming soon.</p>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The DB locks menu edits within 48h of the event; mirror that in the UI.
function menuLocked(booking) {
  const h = hoursUntil(booking?.event_date, booking?.event_time);
  return h !== null && h <= 48;
}

// Per-booking menu context: the quota rules and which items can satisfy each.
function bookingMenuContext(booking) {
  const pkg = booking?.venue_packages || null;
  const cats = booking?.venues?.menu_categories || [];
  const rules = (pkg?.menu_quota_rules || [])
    .slice()
    .sort((a, b) => a.category_kind.localeCompare(b.category_kind));
  const poolIds = new Set((pkg?.package_item_pool || []).map((r) => r.menu_item_id));
  const itemsForKind = (kind) =>
    cats
      .filter((c) => c.kind === kind)
      .flatMap((c) => c.menu_items || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  // Food: the venue's full menu for that category. Hard-liquor: this package's pool.
  const optionsForKind = (kind) =>
    FOOD_QUOTA_KINDS.includes(kind)
      ? itemsForKind(kind)
      : itemsForKind(kind).filter((it) => poolIds.has(it.id));
  const itemById = {};
  const kindByItemId = {};
  cats.forEach((c) =>
    (c.menu_items || []).forEach((it) => {
      itemById[it.id] = it;
      kindByItemId[it.id] = c.kind;
    })
  );
  return { pkg, rules, itemsForKind, optionsForKind, itemById, kindByItemId };
}

// Read-only list of the items a customer selected, grouped by quota category.
function MenuSummary({ booking }) {
  const { rules, itemById, kindByItemId } = bookingMenuContext(booking);
  const selected = Array.isArray(booking?.booking_menu_selections)
    ? booking.booking_menu_selections
    : booking?.booking_menu_selections
    ? [booking.booking_menu_selections]
    : [];
  return (
    <div className="flex flex-col gap-2">
      {rules.map((r) => {
        const names = selected
          .filter((s) => kindByItemId[s.menu_item_id] === r.category_kind)
          .map((s) => itemById[s.menu_item_id]?.name)
          .filter(Boolean)
          .sort();
        return (
          <div key={r.category_kind}>
            <p className="text-sm font-medium text-ink">
              {quotaLabel(r.category_kind, r.quota_count)}
            </p>
            {names.length ? (
              <ul className="list-disc pl-5 text-sm text-haze">
                {names.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-haze/60">—</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReceiptBody({ booking, amountPaid, paymentRef, onFinalize }) {
  const b = booking;
  const total = Number(b.total_amount || 0);
  const remaining = Math.max(0, total - amountPaid);
  const tierLabel =
    b.deposit_tier === "full" ? "Full payment" : b.deposit_tier === "50pct" ? "50%" : "20%";
  const Row = ({ k, v }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-stone-100 text-sm">
      <span className="text-stone-500">{k}</span>
      <span className="text-right font-medium text-stone-900">{v || "—"}</span>
    </div>
  );
  return (
    <div className="receipt-print bg-white text-stone-900 rounded-xl">
      <h2 className="font-display text-xl font-semibold">Booking confirmation receipt</h2>
      <p className="text-xs font-semibold text-[#9a5f0f] mb-3">{b.booking_ref}</p>

      <Row k="Venue" v={b.venues?.name} />
      <Row k="Package" v={b.venue_packages?.name} />
      <Row
        k="Event"
        v={[fmtDate(b.event_date), b.slot, fmtTime(b.event_time)].filter(Boolean).join("   ")}
      />
      <Row k="Guests" v={b.headcount} />

      <div className="h-3" />
      <Row k="Deposit tier" v={tierLabel} />
      <Row k="Amount paid" v={inr(amountPaid)} />
      <Row k="Total package amount" v={inr(total)} />
      {total > 0 && b.venue_packages && (
        b.venue_packages.gst_mode === "excluded" ? (
          <p className="text-xs text-stone-500 py-1.5">
            Amounts are exclusive of GST; the total payable is unchanged.
          </p>
        ) : (
          (() => {
            const { pct, base, gst } = gstSplit(total, b.venue_packages);
            return (
              <>
                <Row k="— Base (excl. GST)" v={inr(base)} />
                <Row k={`— GST (${pct}%)`} v={inr(gst)} />
              </>
            );
          })()
        )
      )}
      <Row k="Remaining balance (payable at venue)" v={inr(remaining)} />
      <Row k="Payment reference" v={paymentRef} />

      <div className="h-3" />
      <Row k="Name" v={b.contact_name} />
      <Row k="Mobile" v={b.contact_mobile} />
      <Row k="Email" v={b.contact_email} />

      <div className="no-print flex flex-wrap gap-2 mt-5">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition"
        >
          Download
        </button>
        {b.status === "confirmed" && !b.menu_finalized_at && (
          <button
            type="button"
            onClick={onFinalize}
            className="border border-stone-300 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-stone-50"
          >
            Finalize your menu
          </button>
        )}
      </div>
    </div>
  );
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDate(d) {
  if (!d) return "";
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Customer booking journey. Returns the index (0-3) of the current stage, or
// null for states that aren't part of the numbered flow (rejected / other).
const BOOKING_STAGES = ["Request Sent", "Accepted", "Payment & Menu", "Confirmed"];
const STAGE_MESSAGES = [
  "Your booking request has been sent. We'll notify you once the venue responds.",
  "Accepted! Complete payment to confirm your booking.",
  "Payment received — now finalize your menu.",
  "All set! Your booking is fully confirmed.",
];

const tierPercent = (tier) => (tier === "20pct" ? 20 : tier === "50pct" ? 50 : 100);

// Preset cancellation reasons; the last pre-fills nothing and asks for free text.
const CANCEL_OTHER = "Other (please specify)";
const CANCEL_REASONS = [
  "Change of plans",
  "Found a better offer elsewhere",
  "Booked by mistake",
  "Venue no longer suitable for my event",
  "Budget constraints",
  CANCEL_OTHER,
];

function bookingStage(b) {
  if (b.status === "pending") return 0;
  if (b.status === "accepted") return 1;
  if (b.status === "confirmed") return b.menu_finalized_at ? 3 : 2;
  return null;
}

function BookingStepper({ stage }) {
  return (
    <ol className="flex items-start mt-4">
      {BOOKING_STAGES.map((label, i) => {
        // Stage 3 is terminal ("fully confirmed"), so every step reads as done.
        const complete = stage === BOOKING_STAGES.length - 1;
        const state = complete || i < stage ? "done" : i === stage ? "current" : "todo";
        // Gold = the step you're on now. Lavender = done or not yet reached.
        const ring =
          state === "current"
            ? "bg-amber text-[#170D0B] border-amber step-active-glow"
            : state === "done"
            ? "bg-haze/25 text-ink border-haze/40"
            : "bg-transparent text-haze/60 border-white/15";
        const line = complete || i < stage ? "bg-haze/40" : "bg-white/10";
        const text =
          state === "current" ? "text-amber font-semibold" : state === "done" ? "text-haze" : "text-haze/50";
        return (
          <li key={label} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div
                className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-semibold ${ring}`}
              >
                {state === "done" ? "✓" : i + 1}
              </div>
              {i < BOOKING_STAGES.length - 1 && <div className={`h-0.5 flex-1 ${line}`} />}
            </div>
            <span className={`mt-1.5 text-[10px] text-center leading-tight ${text}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Venue photos come from user-supplied URLs, some of which are dead. On a
// load failure, take the <img> out of the layout so only its gradient
// fallback shows — no native broken-image icon or alt text. onLoad clears it
// again because the hero carousel reuses a single <img> across venues.
const hideBrokenImg = (e) => {
  e.currentTarget.style.display = "none";
};
const restoreImg = (e) => {
  e.currentTarget.style.display = "";
};

function VenueCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-surface border border-white/10 animate-pulse">
      <div className="w-full h-48 bg-white/5" />
      <div className="p-4">
        <div className="h-4 bg-white/10 rounded w-2/3 mb-2" />
        <div className="h-3 bg-white/10 rounded w-1/3 mb-3" />
        <div className="h-3 bg-white/10 rounded w-full mb-1" />
        <div className="h-3 bg-white/10 rounded w-5/6" />
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("browse");
  const [session, setSession] = useState(null); // { token, userId, email }
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [resetMethod, setResetMethod] = useState("email"); // 'email' | 'phone'
  const [resetStep, setResetStep] = useState("request"); // 'request' | 'sent' | 'verify'
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [recoveryToken, setRecoveryToken] = useState(""); // set when returning from an email reset link
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [newPasswordLoading, setNewPasswordLoading] = useState(false);

  const [venues, setVenues] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [reviewPkg, setReviewPkg] = useState(null); // package whose "Review Menu" modal is open
  const [bookingTypes, setBookingTypes] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [payingBookingId, setPayingBookingId] = useState(null);
  const [payError, setPayError] = useState({}); // keyed by booking id
  const [payAckId, setPayAckId] = useState(null); // booking id showing the partial-payment acknowledgement
  const [otpBusyId, setOtpBusyId] = useState(null);
  const [otpError, setOtpError] = useState({}); // keyed by booking id
  const [fbDraft, setFbDraft] = useState({}); // { [bookingId]: { rating, comment } }
  const [fbBusyId, setFbBusyId] = useState(null);
  const [fbError, setFbError] = useState({}); // keyed by booking id
  const [fbOpenId, setFbOpenId] = useState(null); // booking id whose feedback form is expanded after a skip
  const [receiptId, setReceiptId] = useState(null); // booking id whose receipt modal is open
  const [finalizeId, setFinalizeId] = useState(null); // booking id being finalized on the finalizeMenu screen
  const [menuEditing, setMenuEditing] = useState(false); // reopened an already-finalized menu to change it
  const [menuPicks, setMenuPicks] = useState({}); // { [category_kind]: menu_item_id[] }
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [pendingPackage, setPendingPackage] = useState(null); // { venue, pkg } saved when booking is requested before login

  const [cancelId, setCancelId] = useState(null); // pending booking whose cancel form is open
  const [cancelPreset, setCancelPreset] = useState(""); // selected preset reason
  const [cancelReason, setCancelReason] = useState(""); // editable reason text sent to the DB
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [menuSummaryCollapsed, setMenuSummaryCollapsed] = useState({}); // { [bookingId]: true } — "Your menu" summary hidden; expanded by default
  const [bookingsTab, setBookingsTab] = useState("all"); // My requests status filter

  const [heroIndex, setHeroIndex] = useState(0);
  const [selectedCity, setSelectedCity] = useState(null);
  const [priceSort, setPriceSort] = useState(""); // '' | 'asc' | 'desc'
  const CITIES = ["Delhi", "Gurugram", "Noida", "Dehradun", "Punjab"];

  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [settingsPassword, setSettingsPassword] = useState("");
  const [settingsPasswordConfirm, setSettingsPasswordConfirm] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [form, setForm] = useState({
    customer_name: "",
    contact_mobile: "",
    contact_email: "",
    package_id: "",
    booking_type_id: "",
    occasion_other: "",
    event_date: "",
    event_time: "",
    slot: "Evening",
    male_count: "",
    female_count: "",
    special_request: "",
    ack: false,
    tc_agree: false,
  });
  const [submitError, setSubmitError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const loadVenues = useCallback(async () => {
    setVenuesLoading(true);
    try {
      const data = await sb(
        "/rest/v1/venues?select=*,venue_images(image_url),venue_packages(*,menu_quota_rules(*),package_item_pool(menu_item_id)),menu_categories(id,kind,name,menu_items(id,name,is_available))&status=eq.approved&order=created_at.desc"
      );
      setVenues(data);
    } catch (e) {
      console.error(e);
    } finally {
      setVenuesLoading(false);
    }
  }, []);

  const loadBookingTypes = useCallback(async () => {
    try {
      const data = await sb("/rest/v1/booking_types?select=*&order=name.asc");
      setBookingTypes(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadMyBookings = useCallback(async (token) => {
    try {
      const data = await sb(
        "/rest/v1/bookings?select=*," +
          "venues(name,city,area,venue_type,menu_categories(id,kind,menu_items(id,name,is_available)))," +
          "venue_packages(name,price_per_head,includes_alcohol,gst_mode,menu_quota_rules(category_kind,quota_count),package_item_pool(menu_item_id))," +
          "payments(payment_type,status,amount,paid_at,razorpay_payment_id)," +
          "booking_feedback(id,rating,comment,status)," +
          "booking_menu_selections(menu_item_id)" +
          "&order=created_at.desc",
        { token }
      );
      setMyBookings(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Razorpay Checkout. `paymentType` is "deposit" or "full"; the amount is
  // computed server-side by create-razorpay-order — never sent from here.
  async function startPayment(booking, paymentType) {
    setPayAckId(null);
    setPayError((m) => ({ ...m, [booking.id]: "" }));
    setPayingBookingId(booking.id);
    try {
      if (!window.Razorpay) {
        throw new Error("Payment library didn't load — please refresh and try again.");
      }
      const order = await callFn("create-razorpay-order", session.token, {
        booking_id: booking.id,
        payment_type: paymentType,
      });

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "PAXO",
        description: `${paymentType === "full" ? "Full payment" : "Deposit"} — ${
          booking.venues?.name || "venue booking"
        }`,
        prefill: {
          name: booking.contact_name || profile?.full_name || "",
          email: booking.contact_email || session.email || "",
          contact: booking.contact_mobile || profile?.phone || "",
        },
        theme: { color: "#F5A623" },
        handler: async (response) => {
          try {
            const result = await callFn("verify-razorpay-payment", session.token, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (result.verified) {
              setPayError((m) => ({ ...m, [booking.id]: "" }));
              await loadMyBookings(session.token);
            } else {
              setPayError((m) => ({
                ...m,
                [booking.id]: result.error || "We couldn't confirm that payment. Please try again.",
              }));
            }
          } catch (err) {
            setPayError((m) => ({
              ...m,
              [booking.id]: err.message || "We couldn't confirm that payment. Please try again.",
            }));
          } finally {
            setPayingBookingId(null);
          }
        },
        modal: {
          // Customer closed the popup without paying — just return them to the button.
          ondismiss: () => setPayingBookingId(null),
        },
      });

      rzp.on("payment.failed", (resp) => {
        setPayError((m) => ({
          ...m,
          [booking.id]: resp?.error?.description || "The payment didn't go through. Please try again.",
        }));
        setPayingBookingId(null);
      });

      rzp.open();
    } catch (err) {
      setPayError((m) => ({
        ...m,
        [booking.id]: err.message || "Couldn't start the payment. Please try again.",
      }));
      setPayingBookingId(null);
    }
  }

  // Generate (or regenerate) a 6-digit check-in code for a confirmed booking.
  // The DB lets the customer set this freely until event_started_at is stamped.
  async function generateCheckinOtp(booking) {
    setOtpError((m) => ({ ...m, [booking.id]: "" }));
    setOtpBusyId(booking.id);
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await sb(`/rest/v1/bookings?id=eq.${booking.id}`, {
        method: "PATCH",
        token: session.token,
        prefer: "return=minimal",
        body: { checkin_otp: code, checkin_otp_generated_at: new Date().toISOString() },
      });
      await loadMyBookings(session.token);
    } catch (e) {
      setOtpError((m) => ({
        ...m,
        [booking.id]: e.message || "Couldn't generate a code. Please try again.",
      }));
    } finally {
      setOtpBusyId(null);
    }
  }

  // One booking_feedback row per booking (UNIQUE booking_id). Insert the first
  // time; if a "skipped" row already exists, the DB allows updating it to
  // "submitted" (one-way — submitted rows are immutable).
  async function saveFeedback(booking, existing, payload) {
    setFbError((m) => ({ ...m, [booking.id]: "" }));
    setFbBusyId(booking.id);
    try {
      if (existing?.id) {
        await sb(`/rest/v1/booking_feedback?booking_id=eq.${booking.id}`, {
          method: "PATCH",
          token: session.token,
          prefer: "return=minimal",
          body: payload,
        });
      } else {
        await sb("/rest/v1/booking_feedback", {
          method: "POST",
          token: session.token,
          prefer: "return=minimal",
          body: { booking_id: booking.id, ...payload },
        });
      }
      setFbOpenId(null);
      await loadMyBookings(session.token);
    } catch (e) {
      setFbError((m) => ({ ...m, [booking.id]: e.message || "Couldn't save your feedback. Please try again." }));
    } finally {
      setFbBusyId(null);
    }
  }

  function openCancel(booking) {
    setCancelId(booking.id);
    setCancelPreset("");
    setCancelReason("");
    setCancelError("");
  }

  function closeCancel() {
    setCancelId(null);
    setCancelPreset("");
    setCancelReason("");
    setCancelError("");
  }

  // Pick a preset reason: everything except "Other" pre-fills the editable field.
  function pickCancelPreset(value) {
    setCancelPreset(value);
    setCancelReason(value === CANCEL_OTHER || value === "" ? "" : value);
  }

  // Customer-side cancellation, pending bookings only. The DB
  // (protect_booking_core_fields) rejects any other transition and stamps
  // cancelled_at itself, so we only ever send status + reason.
  async function cancelBooking(booking) {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Please give a reason for cancelling.");
      return;
    }
    setCancelBusy(true);
    setCancelError("");
    try {
      await sb(`/rest/v1/bookings?id=eq.${booking.id}`, {
        method: "PATCH",
        token: session.token,
        prefer: "return=minimal",
        body: { status: "cancelled", cancellation_reason: reason },
      });
      closeCancel();
      await loadMyBookings(session.token);
    } catch (e) {
      setCancelError(e.message || "Couldn't cancel the request. Please try again.");
    } finally {
      setCancelBusy(false);
    }
  }

  function openFinalize(booking, { editing = false } = {}) {
    const { rules, kindByItemId } = bookingMenuContext(booking);
    const picks = Object.fromEntries(rules.map((r) => [r.category_kind, []]));
    if (editing) {
      const existing = Array.isArray(booking.booking_menu_selections)
        ? booking.booking_menu_selections
        : [];
      existing.forEach((s) => {
        const kind = kindByItemId[s.menu_item_id];
        if (picks[kind]) picks[kind].push(s.menu_item_id);
      });
      rules.forEach((r) => {
        picks[r.category_kind] = picks[r.category_kind].slice(0, r.quota_count);
      });
    }
    setFinalizeId(booking.id);
    setMenuEditing(editing);
    setMenuPicks(picks);
    setFinalizeError("");
    setReceiptId(null);
    setScreen("finalizeMenu");
  }

  function togglePick(kind, itemId, quota) {
    setMenuPicks((m) => {
      const cur = m[kind] || [];
      if (cur.includes(itemId)) return { ...m, [kind]: cur.filter((x) => x !== itemId) };
      const next = [...cur, itemId];
      while (next.length > quota) next.shift(); // enforce exact count: drop the oldest
      return { ...m, [kind]: next };
    });
  }

  async function submitMenu(booking) {
    const { rules } = bookingMenuContext(booking);
    const complete = rules.every(
      (r) => (menuPicks[r.category_kind] || []).length === r.quota_count
    );
    if (!complete) return;
    if (menuLocked(booking)) {
      setFinalizeError("Menu changes are locked within 48 hours of your event.");
      return;
    }
    setFinalizeBusy(true);
    setFinalizeError("");
    try {
      const rows = rules.flatMap((r) =>
        (menuPicks[r.category_kind] || []).map((id) => ({ booking_id: booking.id, menu_item_id: id }))
      );
      await sb(`/rest/v1/booking_menu_selections?booking_id=eq.${booking.id}`, {
        method: "DELETE",
        token: session.token,
        prefer: "return=minimal",
      });
      await sb("/rest/v1/booking_menu_selections", {
        method: "POST",
        token: session.token,
        prefer: "return=minimal",
        body: rows,
      });
      await sb(`/rest/v1/bookings?id=eq.${booking.id}`, {
        method: "PATCH",
        token: session.token,
        prefer: "return=minimal",
        body: { menu_finalized_at: new Date().toISOString() },
      });
      setMenuEditing(false);
      await loadMyBookings(session.token);
    } catch (e) {
      setFinalizeError(e.message || "Couldn't save your menu. Please try again.");
    } finally {
      setFinalizeBusy(false);
    }
  }

  const loadProfile = useCallback(async (token, userId) => {
    try {
      const [row] = await sb(`/rest/v1/profiles?id=eq.${userId}&select=full_name,phone,email`, { token });
      setProfile(row);
      setProfileForm({ full_name: row?.full_name || "", phone: row?.phone || "" });
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (screen === "browse") loadVenues();
    if (screen === "request") loadBookingTypes();
    if (screen === "myBookings" && session) loadMyBookings(session.token);
    if (screen === "profile" && session) loadProfile(session.token, session.userId);
  }, [screen, session, loadVenues, loadBookingTypes, loadMyBookings, loadProfile]);

  // Keep the profile loaded in the background once signed in, so the booking form
  // can prefill the customer's name without a separate round trip.
  useEffect(() => {
    if (session) loadProfile(session.token, session.userId);
  }, [session, loadProfile]);

  // Hero carousel: auto-advance through venues every 4 seconds.
  useEffect(() => {
    if (venues.length < 2) return;
    const id = setInterval(() => setHeroIndex((i) => (i + 1) % venues.length), 4000);
    return () => clearInterval(id);
  }, [venues.length]);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setProfileLoading(true);
    try {
      await sb(`/rest/v1/profiles?id=eq.${session.userId}`, {
        method: "PATCH",
        token: session.token,
        prefer: "return=minimal",
        body: { full_name: profileForm.full_name, phone: profileForm.phone },
      });
      setProfileSaved(true);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setSettingsError("");
    setSettingsSaved(false);
    if (settingsPassword.length < 6) {
      setSettingsError("Password must be at least 6 characters.");
      return;
    }
    if (settingsPassword !== settingsPasswordConfirm) {
      setSettingsError("Passwords don't match.");
      return;
    }
    setSettingsLoading(true);
    try {
      await sb("/auth/v1/user", {
        method: "PUT",
        token: session.token,
        body: { password: settingsPassword },
      });
      setSettingsSaved(true);
      setSettingsPassword("");
      setSettingsPasswordConfirm("");
    } catch (e) {
      setSettingsError(e.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  function logOut() {
    setSession(null);
    setMenuOpen(false);
    setScreen("auth");
  }

  // Handle the redirect back from Google: Supabase appends tokens to the URL fragment
  // (#access_token=...&refresh_token=...) once the OAuth round-trip completes.
  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token");
    const type = params.get("type");
    if (!token) return;
    if (type === "recovery") {
      setRecoveryToken(token);
      setScreen("setNewPassword");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    (async () => {
      try {
        const user = await sb("/auth/v1/user", { token });
        setSession({ token, userId: user.id, email: user.email });
        afterAuthSuccess();
        window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {
        setAuthError(e.message);
      }
    })();
  }, []);

  function handleGoogleSignIn() {
    if (window.self !== window.top) {
      setAuthError(
        "Google sign-in can't complete inside this preview — it needs to run on the app's real deployed URL. Use email sign-in here for now."
      );
      return;
    }
    const redirectTo = window.location.href.split("#")[0];
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      redirectTo
    )}`;
  }

  async function requestEmailReset(e) {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      const redirectTo = window.location.href.split("#")[0];
      await sb(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        body: { email: resetEmail },
      });
      setResetStep("sent");
    } catch (e) {
      setResetError(e.message);
    } finally {
      setResetLoading(false);
    }
  }

  async function requestPhoneOtp(e) {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      await sb("/auth/v1/otp", { method: "POST", body: { phone: resetPhone } });
      setResetStep("verify");
    } catch (e) {
      setResetError(e.message);
    } finally {
      setResetLoading(false);
    }
  }

  async function verifyPhoneOtpAndReset(e) {
    e.preventDefault();
    setResetError("");
    if (resetNewPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetLoading(true);
    try {
      const verifyData = await sb("/auth/v1/verify", {
        method: "POST",
        body: { type: "sms", phone: resetPhone, token: resetOtp },
      });
      await sb("/auth/v1/user", {
        method: "PUT",
        token: verifyData.access_token,
        body: { password: resetNewPassword },
      });
      setSession({ token: verifyData.access_token, userId: verifyData.user.id, email: verifyData.user.email });
      afterAuthSuccess();
    } catch (e) {
      setResetError(e.message);
    } finally {
      setResetLoading(false);
    }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    setNewPasswordError("");
    if (newPassword.length < 6) {
      setNewPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setNewPasswordError("Passwords don't match.");
      return;
    }
    setNewPasswordLoading(true);
    try {
      const user = await sb("/auth/v1/user", {
        method: "PUT",
        token: recoveryToken,
        body: { password: newPassword },
      });
      setSession({ token: recoveryToken, userId: user.id, email: user.email });
      afterAuthSuccess();
    } catch (e) {
      setNewPasswordError(e.message);
    } finally {
      setNewPasswordLoading(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const signupData = await sb("/auth/v1/signup", {
          method: "POST",
          body: { email: authEmail, password: authPassword },
        });
        if (signupData.access_token) {
          // Email confirmation is off for this project — we already have a usable session.
          setSession({ token: signupData.access_token, userId: signupData.user.id, email: signupData.user.email });
          afterAuthSuccess();
          return;
        }
        // Email confirmation is required before this account can log in.
        setAuthMode("login");
        setAuthNotice(`We sent a confirmation link to ${authEmail}. Verify it, then sign in below.`);
        return;
      }
      const data = await sb("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email: authEmail, password: authPassword },
      });
      setSession({ token: data.access_token, userId: data.user.id, email: data.user.email });
      afterAuthSuccess();
    } catch (e) {
      if (/email not confirmed/i.test(e.message)) {
        setAuthError("This email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.");
      } else {
        setAuthError(e.message);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function resendConfirmation() {
    setAuthError("");
    setAuthNotice("");
    try {
      await sb("/auth/v1/resend", { method: "POST", body: { type: "signup", email: authEmail } });
      setAuthNotice("Confirmation email resent — check your inbox.");
    } catch (e) {
      setAuthError(e.message);
    }
  }

  function openVenue(v) {
    setSelectedVenue(v);
    setScreen("venue");
  }

  function afterAuthSuccess() {
    if (pendingPackage) {
      setSelectedVenue(pendingPackage.venue);
      startRequest(pendingPackage.pkg);
      setPendingPackage(null);
    } else {
      setScreen("browse");
    }
  }

  function selectPackage(pkg) {
    if (session) {
      startRequest(pkg);
    } else {
      setPendingPackage({ venue: selectedVenue, pkg });
      setScreen("auth");
    }
  }

  function startRequest(pkg) {
    setForm({
      customer_name: profile?.full_name || "",
      contact_mobile: profile?.phone || "",
      contact_email: profile?.email || session?.email || "",
      package_id: pkg.id,
      booking_type_id: "",
      occasion_other: "",
      event_date: "",
      event_time: "",
      slot: "Evening",
      male_count: "",
      female_count: "",
      special_request: "",
      ack: false,
      tc_agree: false,
    });
    setSubmitError("");
    setSubmitted(null);
    setScreen("request");
  }

  async function submitRequest(e) {
    e.preventDefault();
    setSubmitError("");
    if (!form.customer_name.trim()) {
      setSubmitError("Enter your full name.");
      return;
    }
    if (!form.contact_mobile.trim()) {
      setSubmitError("Enter your mobile number.");
      return;
    }
    if (!form.contact_email.trim()) {
      setSubmitError("Enter your email address.");
      return;
    }
    if (!form.booking_type_id) {
      setSubmitError("Select an occasion.");
      return;
    }
    const selectedBookingType = bookingTypes.find((t) => t.id === form.booking_type_id);
    if (selectedBookingType?.name === "Other" && !form.occasion_other.trim()) {
      setSubmitError("Please specify the occasion.");
      return;
    }
    const maleNum = parseInt(form.male_count, 10) || 0;
    const femaleNum = parseInt(form.female_count, 10) || 0;
    const headcount = maleNum + femaleNum;
    if (headcount < 1) {
      setSubmitError("Enter at least 1 guest across Male / Female.");
      return;
    }
    const hrs = hoursUntil(form.event_date, form.event_time);
    if (hrs !== null && hrs < 72 && !form.ack) {
      setSubmitError("Please acknowledge the Express Booking terms before submitting.");
      return;
    }
    if (hrs !== null && hrs < 0) {
      setSubmitError("That date and time has already passed.");
      return;
    }
    if (!form.tc_agree) {
      setSubmitError("Please agree to the Terms & Conditions before submitting.");
      return;
    }
    setSubmitLoading(true);
    try {
      if (form.customer_name.trim() !== (profile?.full_name || "")) {
        sb(`/rest/v1/profiles?id=eq.${session.userId}`, {
          method: "PATCH",
          token: session.token,
          prefer: "return=minimal",
          body: { full_name: form.customer_name.trim() },
        }).catch(() => {});
      }
      const [row] = await sb("/rest/v1/bookings", {
        method: "POST",
        token: session.token,
        prefer: "return=representation",
        body: {
          customer_id: session.userId,
          venue_id: selectedVenue.id,
          package_id: form.package_id,
          booking_type_id: form.booking_type_id || null,
          occasion_other: selectedBookingType?.name === "Other" ? form.occasion_other.trim() : null,
          event_date: form.event_date,
          event_time: form.event_time,
          slot: form.slot,
          male_count: maleNum || null,
          female_count: femaleNum || null,
          contact_name: form.customer_name.trim(),
          contact_mobile: form.contact_mobile.trim(),
          contact_email: form.contact_email.trim(),
          special_request: form.special_request.trim() || null,
        },
      });
      setSubmitted(row);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  const hrs = hoursUntil(form.event_date, form.event_time);
  const maleNum = parseInt(form.male_count, 10) || 0;
  const femaleNum = parseInt(form.female_count, 10) || 0;
  const headcountNum = maleNum + femaleNum;
  const preview = headcountNum > 0 ? depositPreview(headcountNum, hrs) : null;
  const selectedPackage = selectedVenue?.venue_packages?.find((p) => p.id === form.package_id);
  const totalPreview = selectedPackage && headcountNum ? selectedPackage.price_per_head * headcountNum : 0;
  const selectedBookingType = bookingTypes.find((t) => t.id === form.booking_type_id);

  const statusColor = {
    pending: "bg-amber/15 text-amber border border-amber/30",
    accepted: "bg-amber/15 text-amber border border-amber/30",
    confirmed: "bg-haze/15 text-haze border border-haze/30",
    completed: "bg-haze/15 text-haze border border-haze/30",
    rejected: "bg-red-500/15 text-red-300 border border-red-400/30",
    cancelled: "bg-red-500/15 text-red-300 border border-red-400/30",
    unconfirmed: "bg-white/10 text-haze border border-white/15",
    no_show: "bg-red-500/15 text-red-300 border border-red-400/30",
  };

  const cheapestPrice = (v) =>
    v.venue_packages?.length ? Math.min(...v.venue_packages.map((p) => p.price_per_head)) : Infinity;

  const visibleVenues = venues
    .filter((v) => !selectedCity || v.city === selectedCity)
    .sort((a, b) => {
      if (!priceSort) return 0;
      const diff = cheapestPrice(a) - cheapestPrice(b);
      return priceSort === "desc" ? -diff : diff;
    });

  if (screen === "auth") {
    const chipsRow1 = ["Book your venue instantly", "Easy to use", "Unlimited packages", "Select your menu"];
    const chipsRow2 = ["Easy payment methods", "Use anytime, anywhere", "Live booking status", "Rate your experience"];
    return (
      <div
        className="relative min-h-screen bg-base text-ink flex flex-col justify-center px-6 py-10 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(60% 45% at 78% 8%, rgba(245,166,35,0.16), transparent 70%), radial-gradient(55% 40% at 12% 95%, rgba(217,80,40,0.14), transparent 70%)",
        }}
      >
        <style>{`
          @keyframes marquee-left { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          @keyframes marquee-right { from { transform: translateX(-50%); } to { transform: translateX(0); } }
          .marquee-track { display: flex; width: max-content; gap: 12px; }
          .marquee-left { animation: marquee-left 22s linear infinite; }
          .marquee-right { animation: marquee-right 26s linear infinite; }
        `}</style>
        <div className="max-w-sm mx-auto w-full">
          <button
            type="button"
            className="text-sm text-haze hover:text-ink mb-6"
            onClick={() => {
              setPendingPackage(null);
              setScreen("browse");
            }}
          >
            ← Back to browsing
          </button>
          <h1 className="font-display font-bold leading-[0.95] tracking-tight mb-5">
            <span className="block text-5xl">
              <span className="text-ink">Book</span>{" "}
              <span className="text-amber">venues</span>
            </span>
            <span className="block text-5xl text-ink">without the wait</span>
          </h1>
        </div>

        <div className="w-full mb-5 flex flex-col gap-3">
          <div className="overflow-hidden">
            <div className="marquee-track marquee-left">
              {[...chipsRow1, ...chipsRow1].map((c, i) => (
                <span key={i} className="whitespace-nowrap text-sm text-haze border border-white/15 rounded-full px-4 py-2">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="marquee-track marquee-right">
              {[...chipsRow2, ...chipsRow2].map((c, i) => (
                <span key={i} className="whitespace-nowrap text-sm text-haze border border-white/15 rounded-full px-4 py-2">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-sm mx-auto w-full">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full bg-white text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold flex items-center justify-center gap-2 mb-4"
          >
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-sky-500 via-red-500 to-amber inline-block" />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-xs text-haze">or</span>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          <form onSubmit={handleAuth} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="Enter email address"
              className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            {authNotice && <p className="text-amber text-sm px-1">{authNotice}</p>}
            {authError && (
              <div className="flex flex-col gap-1">
                <p className="text-red-300 text-sm px-1">{authError}</p>
                {/confirmed/i.test(authError) && (
                  <button type="button" className="text-amber text-xs text-left px-1" onClick={resendConfirmation}>
                    Resend confirmation email
                  </button>
                )}
              </div>
            )}
            {authMode === "login" && (
              <button
                type="button"
                className="text-amber text-xs text-right -mt-1"
                onClick={() => {
                  setResetError("");
                  setResetStep("request");
                  setScreen("forgot");
                }}
              >
                Forgot password?
              </button>
            )}
            <button
              disabled={authLoading}
              className="bg-amber text-[#170D0B] rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50 mt-1"
            >
              {authLoading ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-center text-haze text-sm mt-6">
            {authMode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-amber font-medium"
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthError("");
              }}
            >
              {authMode === "login" ? "Create account" : "Login"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (screen === "forgot") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#2A1512] text-ink flex flex-col justify-center px-6 py-16">
        <div className="max-w-sm mx-auto w-full">
          <button className="text-sm text-haze hover:text-ink mb-6" onClick={() => setScreen("auth")}>
            ← Back to sign in
          </button>
          <h1 className="font-black text-3xl mb-1">Reset your password</h1>
          <p className="text-haze text-sm mb-6">
            We'll help you set a new password using your email or phone number.
          </p>

          <div className="flex gap-2 mb-6">
            <button
              className={`flex-1 rounded-full py-2 text-sm font-medium ${
                resetMethod === "email" ? "bg-amber text-[#170D0B]" : "border border-white/15 text-haze"
              }`}
              onClick={() => {
                setResetMethod("email");
                setResetStep("request");
                setResetError("");
              }}
            >
              Email
            </button>
            <button
              className={`flex-1 rounded-full py-2 text-sm font-medium ${
                resetMethod === "phone" ? "bg-amber text-[#170D0B]" : "border border-white/15 text-haze"
              }`}
              onClick={() => {
                setResetMethod("phone");
                setResetStep("request");
                setResetError("");
              }}
            >
              Phone
            </button>
          </div>

          {resetMethod === "email" && resetStep === "request" && (
            <form onSubmit={requestEmailReset} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Enter email address"
                className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              {resetError && <p className="text-red-300 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber text-[#170D0B] rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {resetMethod === "email" && resetStep === "sent" && (
            <div className="border border-amber/30 bg-amber/10 rounded-xl p-4 text-sm text-ink">
              Check <span className="font-medium">{resetEmail}</span> for a reset link. Opening it will bring
              you back here to set a new password.
            </div>
          )}

          {resetMethod === "phone" && resetStep === "request" && (
            <form onSubmit={requestPhoneOtp} className="flex flex-col gap-3">
              <input
                type="tel"
                required
                placeholder="+91 98765 43210"
                className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
                value={resetPhone}
                onChange={(e) => setResetPhone(e.target.value)}
              />
              {resetError && <p className="text-red-300 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber text-[#170D0B] rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetLoading ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {resetMethod === "phone" && resetStep === "verify" && (
            <form onSubmit={verifyPhoneOtpAndReset} className="flex flex-col gap-3">
              <p className="text-haze text-xs -mt-1">Code sent to {resetPhone}</p>
              <input
                type="text"
                required
                placeholder="6-digit code"
                className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
              />
              {resetError && <p className="text-red-300 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber text-[#170D0B] rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetLoading ? "Resetting…" : "Reset password"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (screen === "setNewPassword") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#2A1512] text-ink flex flex-col justify-center px-6 py-16">
        <div className="max-w-sm mx-auto w-full">
          <h1 className="font-black text-3xl mb-1">Set a new password</h1>
          <p className="text-haze text-sm mb-6">Choose a new password for your account.</p>
          <form onSubmit={submitNewPassword} className="flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm new password"
              className="bg-white/5 border border-white/15 rounded-full px-5 py-3.5 text-sm placeholder-haze/50 text-ink focus:outline-none focus:border-amber/60"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
            />
            {newPasswordError && <p className="text-red-300 text-sm px-1">{newPasswordError}</p>}
            <button
              disabled={newPasswordLoading}
              className="bg-amber text-[#170D0B] rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              {newPasswordLoading ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base text-ink pb-20 sm:pb-0">
      <header className="bg-base/90 backdrop-blur border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-2 cursor-pointer" onClick={() => setScreen("browse")}>
            <span className="font-display text-2xl font-bold tracking-tight text-ink">Paxo</span>
            <span className="text-xs text-haze hidden sm:inline">venue bookings</span>
          </div>
          {session ? (
            <nav className="flex items-center gap-4 text-sm relative">
              <div className="hidden sm:flex items-center gap-4">
                <button
                  className={`transition-colors ${screen === "browse" ? "text-ink" : "text-haze hover:text-ink"}`}
                  onClick={() => setScreen("browse")}
                >
                  Venues
                </button>
                <button
                  className={`transition-colors ${screen === "myBookings" ? "text-ink" : "text-haze hover:text-ink"}`}
                  onClick={() => setScreen("myBookings")}
                >
                  My bookings
                </button>
                <button
                  className={`transition-colors ${screen === "profile" ? "text-ink" : "text-haze hover:text-ink"}`}
                  onClick={() => setScreen("profile")}
                >
                  Profile
                </button>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-white/10 text-ink font-semibold flex items-center justify-center text-xs border border-white/15"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {(session.email || "?").slice(0, 1).toUpperCase()}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 w-48 bg-surface text-ink rounded-xl border border-white/10 shadow-hero overflow-hidden z-10">
                  <p className="px-4 py-3 text-xs text-haze border-b border-white/10 truncate">{session.email}</p>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5" onClick={() => { setScreen("profile"); setMenuOpen(false); }}>
                    Profile
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5" onClick={() => { setScreen("myBookings"); setMenuOpen(false); }}>
                    My bookings
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5" onClick={() => { setScreen("settings"); setMenuOpen(false); }}>
                    Settings
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5" onClick={() => { setScreen("help"); setMenuOpen(false); }}>
                    Help & support
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-white/5 border-t border-white/10" onClick={logOut}>
                    Log out
                  </button>
                </div>
              )}
            </nav>
          ) : (
            <button
              className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-1.5 rounded-full"
              onClick={() => setScreen("auth")}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main key={screen} className="max-w-4xl mx-auto px-5 py-8">
        {screen === "browse" && (
          <div>
            <h1 className="font-display text-3xl font-bold mb-1">Find a venue</h1>
            <p className="text-haze text-sm mb-5">Clubs, lounges and banquets ready for your night.</p>

            {venues.length > 0 && (
              <div
                className="relative rounded-3xl overflow-hidden h-60 mb-7 cursor-pointer shadow-hero bg-gradient-to-br from-surface to-[#2A1512]"
                onClick={() => openVenue(venues[heroIndex % venues.length])}
              >
                <img
                  key={
                    venues[heroIndex % venues.length].venue_images?.[0]?.image_url ||
                    venues[heroIndex % venues.length].cover_image_url ||
                    heroIndex
                  }
                  src={
                    venues[heroIndex % venues.length].venue_images?.[0]?.image_url ||
                    venues[heroIndex % venues.length].cover_image_url
                  }
                  alt=""
                  onError={hideBrokenImg}
                  onLoad={restoreImg}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-base via-base/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-5 text-ink">
                  <p className="font-display text-2xl font-bold">{venues[heroIndex % venues.length].name}</p>
                  <p className="text-sm text-haze">
                    {venues[heroIndex % venues.length].area ? `${venues[heroIndex % venues.length].area}, ` : ""}
                    {venues[heroIndex % venues.length].city}
                  </p>
                  {minPackagePrice(venues[heroIndex % venues.length]) != null && (
                    <p className="text-sm text-amber font-semibold mt-1">
                      Unlimited packages from{" "}
                      {inr(minPackagePrice(venues[heroIndex % venues.length]))} / head
                    </p>
                  )}
                </div>
                <div className="absolute bottom-4 right-5 flex gap-1.5">
                  {venues.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${i === heroIndex % venues.length ? "bg-amber" : "bg-white/30"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  selectedCity === null ? "bg-ink text-[#170D0B] border-ink" : "border-white/15 text-haze hover:text-ink"
                }`}
                onClick={() => setSelectedCity(null)}
              >
                All cities
              </button>
              {CITIES.map((c) => (
                <button
                  key={c}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    selectedCity === c ? "bg-ink text-[#170D0B] border-ink" : "border-white/15 text-haze hover:text-ink"
                  }`}
                  onClick={() => setSelectedCity(c)}
                >
                  {c}
                </button>
              ))}
              <Select
                ariaLabel="Sort by price"
                wrapperClassName="sm:ml-auto"
                className="text-sm px-3 py-1.5 rounded-full border border-white/15 text-haze bg-surface focus:outline-none focus:border-amber/60"
                value={priceSort}
                onChange={(v) => setPriceSort(v)}
                options={[
                  { value: "", label: "Sort by price" },
                  { value: "asc", label: "Price: low to high" },
                  { value: "desc", label: "Price: high to low" },
                ]}
              />
            </div>

            {venuesLoading ? (
              <div className="grid sm:grid-cols-2 gap-5">
                <VenueCardSkeleton />
                <VenueCardSkeleton />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-5">
                {visibleVenues.map((v) => (
                  <div
                    key={v.id}
                    className="group rounded-2xl overflow-hidden bg-surface border border-white/10 cursor-pointer hover:border-amber/50 transition-colors shadow-card"
                    onClick={() => openVenue(v)}
                  >
                    <div className="relative h-44 bg-gradient-to-br from-surface to-[#2A1512]">
                      <img
                        src={v.venue_images?.[0]?.image_url || v.cover_image_url}
                        alt=""
                        onError={hideBrokenImg}
                        onLoad={restoreImg}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
                      {v.is_verified && (
                        <span className="absolute top-3 left-3 text-[10px] font-semibold text-amber bg-base/80 border border-amber/40 rounded px-2 py-0.5">
                          ✓ Verified
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="font-display text-lg font-semibold text-ink leading-tight">{v.name}</h3>
                        <p className="text-xs text-haze">
                          {v.area ? `${v.area}, ` : ""}
                          {v.city}
                        </p>
                        {minPackagePrice(v) != null && (
                          <p className="text-sm font-semibold text-amber mt-0.5">
                            From {inr(minPackagePrice(v))} / head
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      {v.venue_type && (
                        <p className="text-xs text-haze mb-1">{v.venue_type}</p>
                      )}
                      <p className="text-sm text-haze line-clamp-2">{v.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {v.serves_alcohol && (
                          <span className="inline-block text-xs bg-white/5 text-haze px-2 py-0.5 rounded">
                            Serves alcohol
                          </span>
                        )}
                        {v.guest_capacity && (
                          <span className="inline-block text-xs bg-white/5 text-haze px-2 py-0.5 rounded">
                            Up to {v.guest_capacity} guests
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="mt-4 w-full bg-amber text-[#170D0B] text-sm font-semibold py-2.5 rounded-xl hover:brightness-110 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVenue(v);
                        }}
                      >
                        Book now
                      </button>
                    </div>
                  </div>
                ))}
                {visibleVenues.length === 0 && (
                  <p className="text-haze/70 text-sm col-span-2">No venues in {selectedCity} yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {screen === "venue" && selectedVenue && (
          <div>
            <button className="text-sm text-haze hover:text-ink mb-4" onClick={() => setScreen("browse")}>
              ← Back to venues
            </button>
            <div className="h-60 mb-4 rounded-2xl overflow-hidden shadow-hero bg-gradient-to-br from-surface to-[#2A1512]">
              <img
                src={selectedVenue.venue_images?.[0]?.image_url || selectedVenue.cover_image_url}
                alt=""
                onError={hideBrokenImg}
                onLoad={restoreImg}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="font-display text-3xl font-bold">{selectedVenue.name}</h1>
              {selectedVenue.is_verified && (
                <span className="text-xs font-semibold text-amber bg-amber/10 border border-amber/30 rounded px-2 py-0.5">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-haze mb-4">
              <span>
                {selectedVenue.address || `${selectedVenue.area}, ${selectedVenue.city}`}
              </span>
              {selectedVenue.venue_type && (
                <span className="text-xs bg-white/5 text-haze px-2 py-0.5 rounded">
                  {selectedVenue.venue_type}
                </span>
              )}
              {selectedVenue.guest_capacity && (
                <span className="text-xs bg-white/5 text-haze px-2 py-0.5 rounded">
                  Up to {selectedVenue.guest_capacity} guests
                </span>
              )}
            </div>
            <p className="text-ink/90 mb-6">{selectedVenue.description}</p>
            <h2 className="font-display text-xl font-semibold mb-3">Unlimited packages</h2>

            <VenueFullMenu venue={selectedVenue} />

            <div className="flex flex-col gap-3 mt-8">
              {selectedVenue.venue_packages?.map((p) => (
                <div key={p.id} className="rounded-2xl p-4 flex items-start justify-between gap-4 bg-surface border border-white/10 shadow-card">
                  <div>
                    <p className="font-display font-semibold text-ink">{p.name}</p>
                    <p className="text-sm text-haze">{p.description}</p>
                    <p className="text-xs text-haze/70 mt-1">
                      {p.min_headcount}–{p.max_headcount || "∞"} guests
                      {p.duration_hours ? `   ${p.duration_hours} hrs` : ""}
                    </p>
                    {(() => {
                      const quotas = [...(p.menu_quota_rules || [])].sort((a, b) =>
                        a.category_kind.localeCompare(b.category_kind)
                      );
                      const food = quotas.filter((q) => FOOD_QUOTA_KINDS.includes(q.category_kind));
                      const bev = quotas.filter((q) => !FOOD_QUOTA_KINDS.includes(q.category_kind));
                      const line = (q) => (
                        <>
                          Choose <span className="text-amber font-semibold">{q.quota_count}</span>{" "}
                          {quotaLabel(q.category_kind, q.quota_count)}
                        </>
                      );
                      return (
                        <>
                          {food.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-ink mb-0.5">Food</p>
                              <ul className="list-disc pl-4 text-xs text-haze flex flex-col gap-0.5">
                                {food.map((q) => (
                                  <li key={q.id}>{line(q)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(bev.length > 0 || p.inclusions?.length > 0) && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-ink mb-0.5">Beverages</p>
                              <ul className="list-disc pl-4 text-xs text-haze flex flex-col gap-0.5">
                                {bev.map((q) => (
                                  <li key={q.id}>{line(q)}</li>
                                ))}
                                {(p.inclusions || []).map((inc, i) => (
                                  <li key={`inc-${i}`}>{inc}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <GstLine pkg={p} className="text-xs text-haze/70 mt-3" />
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <p className="font-semibold text-amber">{inr(p.price_per_head)} <span className="text-haze font-normal text-xs">/ head</span></p>
                    <button
                      className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl hover:brightness-110 transition"
                      onClick={() => selectPackage(p)}
                    >
                      Select package
                    </button>
                    <button
                      type="button"
                      className="border border-white/15 text-haze hover:text-ink text-sm px-4 py-2 rounded-xl"
                      onClick={() => setReviewPkg(p)}
                    >
                      Review menu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === "request" && selectedVenue && !submitted && (
          <div className="max-w-lg">
            <button className="text-sm text-haze hover:text-ink mb-4" onClick={() => setScreen("venue")}>
              ← Back to {selectedVenue.name}
            </button>
            <h1 className="font-display text-3xl font-bold mb-4">Request a booking</h1>

            <div className="rounded-2xl p-4 bg-surface border border-white/10 text-sm mb-6">
              <p className="font-display font-semibold text-ink">{selectedVenue.name}</p>
              <p className="text-haze text-xs mb-2">
                {selectedVenue.area ? `${selectedVenue.area}, ` : ""}
                {selectedVenue.city}
              </p>
              <div className="flex justify-between text-xs text-haze pt-2 border-t border-white/10">
                <span>{selectedPackage?.name}</span>
                <span className="text-amber font-semibold">{inr(selectedPackage?.price_per_head || 0)} / person</span>
              </div>
            </div>

            <form onSubmit={submitRequest} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Full name</label>
                <input
                  type="text"
                  required
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Mobile number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.contact_mobile}
                    onChange={(e) => setForm({ ...form, contact_mobile: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Email address</label>
                  <input
                    type="email"
                    required
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">City</label>
                <input
                  type="text"
                  disabled
                  className="border border-white/10 bg-white/[0.03] text-haze rounded-lg px-3 py-2 text-sm w-full"
                  value={selectedVenue.city}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Occasion</label>
                <Select
                  ariaLabel="Occasion"
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink focus:outline-none focus:border-amber/60"
                  value={form.booking_type_id}
                  onChange={(v) => setForm({ ...form, booking_type_id: v })}
                  options={[
                    { value: "", label: "Select an occasion" },
                    ...bookingTypes.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>

              {selectedBookingType?.name === "Other" && (
                <div>
                  <label className="text-sm font-medium block mb-1">Please specify occasion</label>
                  <input
                    type="text"
                    required
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.occasion_other}
                    onChange={(e) => setForm({ ...form, occasion_other: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Event date</label>
                  <input
                    type="date"
                    required
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.event_date}
                    onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Party slot timing</label>
                  <input
                    type="time"
                    required
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.event_time}
                    onChange={(e) => setForm({ ...form, event_time: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Slot</label>
                <Select
                  ariaLabel="Slot"
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink focus:outline-none focus:border-amber/60"
                  value={form.slot}
                  onChange={(v) => setForm({ ...form, slot: v })}
                  options={[
                    { value: "Morning", label: "Morning" },
                    { value: "Afternoon", label: "Afternoon" },
                    { value: "Evening", label: "Evening" },
                    { value: "Night", label: "Night" },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Male</label>
                  <input
                    type="number"
                    min="0"
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.male_count}
                    onChange={(e) => setForm({ ...form, male_count: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Female</label>
                  <input
                    type="number"
                    min="0"
                    className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                    value={form.female_count}
                    onChange={(e) => setForm({ ...form, female_count: e.target.value })}
                  />
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex justify-between items-center">
                <span className="text-haze">Total guest count</span>
                <span className="font-semibold text-ink">{headcountNum}</span>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Special request / notes</label>
                <textarea
                  rows={3}
                  placeholder="Tell the venue about any special requirements for your event"
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                  value={form.special_request}
                  onChange={(e) => setForm({ ...form, special_request: e.target.value })}
                />
              </div>

              {headcountNum > 0 && (
                <div className="bg-surface border border-white/10 rounded-2xl p-4 text-sm">
                  <h3 className="font-display font-semibold text-ink mb-2">Booking summary</h3>
                  <div className="flex justify-between mb-1">
                    <span className="text-haze">{selectedPackage?.name} × {headcountNum} guests</span>
                    <span className="text-haze">{inr(selectedPackage?.price_per_head || 0)} / head</span>
                  </div>
                  <div className="flex justify-between mb-2 pb-2 border-b border-white/10 font-semibold text-base text-ink">
                    <span>Estimated package value</span>
                    <span className="text-amber">{inr(totalPreview)}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-haze">{preview.bookingCategory}</span>
                    <span className="font-medium text-ink">{preview.tier}</span>
                  </div>
                  <p className="text-xs text-haze/80">{preview.reason}</p>
                </div>
              )}

              {hrs !== null && hrs >= 0 && hrs < 72 && (
                <div className="border border-red-400/40 bg-red-500/10 rounded-2xl p-4 text-sm">
                  <p className="font-semibold text-red-200 mb-1">This is an express booking</p>
                  <p className="text-red-200/80 mb-3">
                    Your event is less than 72 hours away. If accepted, full payment is required
                    immediately and this booking cannot be cancelled once confirmed.
                  </p>
                  <label className="flex items-start gap-2 text-red-200">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-amber"
                      checked={form.ack}
                      onChange={(e) => setForm({ ...form, ack: e.target.checked })}
                    />
                    <span>I understand this booking is non-cancellable and requires full payment upfront.</span>
                  </label>
                </div>
              )}

              <div className="border border-white/10 bg-white/[0.03] rounded-2xl p-4 text-xs text-haze max-h-32 overflow-y-auto">
                <p className="font-semibold text-ink mb-1">Booking terms &amp; conditions</p>
                <ul className="list-disc pl-4 flex flex-col gap-1">
                  <li>The venue has up to 2 hours to accept or reject your request.</li>
                  <li>Your deposit is due immediately once the venue accepts.</li>
                  <li>The remaining balance is paid directly to the venue at the event.</li>
                  <li>Express Bookings (made under 72 hours before the event) require full payment and cannot be cancelled.</li>
                  <li>Cancellations 72+ hours before the event are refunded minus a flat ₹2,000 admin fee; later cancellations forfeit more of the deposit to the venue.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-amber"
                  checked={form.tc_agree}
                  onChange={(e) => setForm({ ...form, tc_agree: e.target.checked })}
                />
                <span>I have read and agree to the terms &amp; conditions above.</span>
              </label>

              {submitError && <p className="text-red-300 text-sm">{submitError}</p>}

              <button
                disabled={submitLoading}
                className="bg-amber text-[#170D0B] font-semibold rounded-xl px-4 py-2.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
              >
                {submitLoading ? "Submitting…" : "Submit request"}
              </button>
            </form>
          </div>
        )}

        {screen === "request" && submitted && (
          <div className="max-w-lg">
            <div className="bg-surface border border-white/10 rounded-2xl p-6 text-center shadow-card">
              <h2 className="font-display text-2xl font-bold text-ink mb-2">Request sent</h2>
              <p className="text-haze text-sm mb-4">
                {selectedVenue.name} has up to 2 hours to respond. You'll see the status update under
                "My requests".
              </p>
              <button
                className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2.5 rounded-xl hover:brightness-110 transition"
                onClick={() => setScreen("myBookings")}
              >
                View my requests
              </button>
            </div>
          </div>
        )}

        {screen === "myBookings" && (() => {
          const BOOKINGS_TABS = ["all", "pending", "accepted", "confirmed", "completed", "cancelled"];
          const visibleBookings = myBookings.filter(
            (b) => bookingsTab === "all" || b.status === bookingsTab
          );
          return (
          <div>
            <h1 className="font-display text-3xl font-bold mb-1">My requests</h1>
            <p className="text-haze text-sm mb-4">Track the status of every booking you've requested.</p>

            <div className="flex flex-wrap gap-2 mb-6">
              {BOOKINGS_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBookingsTab(t)}
                  className={`text-sm px-3 py-1.5 rounded-full border capitalize transition-colors ${
                    bookingsTab === t
                      ? "bg-ink text-[#170D0B] border-ink"
                      : "border-white/15 text-haze hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {myBookings.length === 0 ? (
              <p className="text-haze/70 text-sm">You haven't requested any bookings yet.</p>
            ) : visibleBookings.length === 0 ? (
              <p className="text-haze/70 text-sm">
                No {bookingsTab === "all" ? "" : `${bookingsTab} `}requests.
              </p>
            ) : null}
            <div className="flex flex-col gap-4">
              {visibleBookings.map((b) => {
                const paid = (b.payments || []).filter((p) => p.status === "paid");
                const paidFull = paid.some((p) => p.payment_type === "full");
                const paidDeposit = paid.some((p) => p.payment_type === "deposit");
                const anyPaid = paid.length > 0;
                const partialPaid = paidDeposit && !paidFull; // balance still owed at venue
                const pct = tierPercent(b.deposit_tier);
                const canSplit = b.deposit_tier !== "full"; // full-payment tiers have no partial option
                const stage = bookingStage(b);
                const rejected = b.status === "rejected";
                const fb = Array.isArray(b.booking_feedback)
                  ? b.booking_feedback[0] || null
                  : b.booking_feedback || null;
                const draft = fbDraft[b.id] || { rating: 0, comment: "" };
                const whenLine = [fmtDate(b.event_date), b.slot, fmtTime(b.event_time)].filter(Boolean).join("   ");

                return (
                  <div key={b.id} className="rounded-2xl p-4 bg-surface border border-white/10 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display font-semibold text-ink">{b.venues?.name}</p>
                        <p className="text-sm text-haze">
                          {b.venue_packages?.name}
                          <span className="block">{whenLine}</span>
                          <span className="block">{b.headcount} guests</span>
                        </p>
                        <p className="text-xs text-amber font-medium mt-0.5">
                          {b.booking_ref || "Booking"}
                        </p>
                      </div>
                      {stage === null && (
                        <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 capitalize ${statusColor[b.status] || "bg-white/10 text-haze"}`}>
                          {b.status.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>

                    {rejected ? (
                      <div className="mt-3 border border-red-400/30 bg-red-500/10 rounded-xl p-3">
                        <p className="text-sm font-semibold text-red-200">Booking declined</p>
                        <p className="text-sm text-haze mt-1 whitespace-pre-wrap">
                          {b.rejection_reason || "The venue couldn't take this booking."}
                        </p>
                        <button
                          type="button"
                          onClick={() => setScreen("browse")}
                          className="mt-2 text-sm font-medium text-amber hover:brightness-110"
                        >
                          Browse other venues
                        </button>
                      </div>
                    ) : stage !== null ? (
                      <>
                        <BookingStepper stage={stage} />
                        <p className="text-sm text-haze mt-3">{STAGE_MESSAGES[stage]}</p>

                        {b.status === "pending" && (
                          cancelId === b.id ? (
                            <div className="mt-3 border border-white/10 rounded-xl p-3 bg-white/[0.03] flex flex-col gap-2">
                              <p className="text-xs font-semibold text-haze">Cancel this request</p>
                              <Select
                                ariaLabel="Reason for cancelling"
                                className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink focus:outline-none focus:border-amber/60"
                                value={cancelPreset}
                                onChange={pickCancelPreset}
                                options={[
                                  { value: "", label: "Select a reason" },
                                  ...CANCEL_REASONS.map((r) => ({ value: r, label: r })),
                                ]}
                              />
                              <textarea
                                rows={2}
                                placeholder="Tell the venue why you're cancelling"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                              />
                              {cancelError && <p className="text-xs text-red-300">{cancelError}</p>}
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={cancelBusy || !cancelReason.trim()}
                                  onClick={() => cancelBooking(b)}
                                  className="bg-red-500/90 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:brightness-110 transition"
                                >
                                  {cancelBusy ? "Cancelling…" : "Confirm cancellation"}
                                </button>
                                <button
                                  type="button"
                                  disabled={cancelBusy}
                                  onClick={closeCancel}
                                  className="text-sm text-haze hover:text-ink px-2 disabled:opacity-50"
                                >
                                  Keep request
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openCancel(b)}
                              className="mt-3 text-sm font-medium text-red-300 hover:brightness-110"
                            >
                              Cancel request
                            </button>
                          )
                        )}

                        {stage === 1 && (
                          <div className="mt-3 border border-white/10 rounded-xl p-3 bg-white/[0.03]">
                            <p className="text-xs font-semibold text-haze mb-2">
                              Booking summary
                            </p>
                            <dl className="text-sm text-ink flex flex-col gap-1">
                              <div className="flex justify-between gap-4">
                                <dt className="text-haze">Booking ID</dt>
                                <dd className="font-medium">{b.booking_ref}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-haze">Date &amp; slot</dt>
                                <dd className="text-right">{whenLine}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-haze">Venue</dt>
                                <dd className="text-right">
                                  {b.venues?.name}
                                  {(b.venues?.area || b.venues?.city) && (
                                    <span className="block text-xs text-haze/70">
                                      {[b.venues?.area, b.venues?.city].filter(Boolean).join(", ")}
                                    </span>
                                  )}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-haze">Package</dt>
                                <dd className="text-right">{b.venue_packages?.name}</dd>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-white/10 pt-1 mt-1">
                                <dt className="text-haze">
                                  {b.deposit_tier === "full" ? "Full payment" : b.deposit_tier === "50pct" ? "50% deposit" : "20% deposit"} due now
                                </dt>
                                <dd className="font-semibold text-amber">{inr(b.deposit_amount)}</dd>
                              </div>
                            </dl>

                            {anyPaid ? (
                              <button
                                type="button"
                                onClick={() => setReceiptId(b.id)}
                                className="text-sm font-medium text-amber hover:brightness-110 mt-3"
                              >
                                Payment confirmed — view receipt
                              </button>
                            ) : (
                              <div className="mt-3 flex flex-col gap-2 items-start">
                                {canSplit && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={payingBookingId === b.id}
                                      onClick={() => setPayAckId(payAckId === b.id ? null : b.id)}
                                      className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:brightness-110 transition"
                                    >
                                      {`Pay ${pct}% now — ${inr(b.deposit_amount)}`}
                                    </button>
                                    {payAckId === b.id && (
                                      <div className="border border-amber/30 bg-amber/10 rounded-xl p-3 w-full">
                                        <p className="text-sm text-ink">
                                          The remaining {100 - pct}% is payable directly to the venue at
                                          the event — please arrive at least 30 minutes early to complete
                                          this and check in.
                                        </p>
                                        <button
                                          type="button"
                                          disabled={payingBookingId === b.id}
                                          onClick={() => startPayment(b, "deposit")}
                                          className="mt-2 bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:brightness-110 transition"
                                        >
                                          {payingBookingId === b.id ? "Opening…" : `I understand — pay ${pct}% now`}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                                <button
                                  type="button"
                                  disabled={payingBookingId === b.id}
                                  onClick={() => startPayment(b, "full")}
                                  className={`text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition ${
                                    canSplit
                                      ? "border border-white/15 text-haze hover:text-ink"
                                      : "bg-amber text-[#170D0B] hover:brightness-110"
                                  }`}
                                >
                                  {payingBookingId === b.id ? "Opening…" : `Pay in full now — ${inr(b.total_amount)}`}
                                </button>
                                {payError[b.id] && (
                                  <p className="text-xs text-red-300">{payError[b.id]}</p>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-haze/80 mt-3">
                              Once your payment is confirmed, you'll be able to choose your exact food and
                              drinks from this package — for example, if a package allows "Choose 3 Veg
                              Starters," you'll see every available option but can only select 3.
                            </p>
                          </div>
                        )}

                        {b.status === "confirmed" && (
                          <button
                            type="button"
                            onClick={() => setReceiptId(b.id)}
                            className="text-sm font-medium text-amber hover:brightness-110 mt-3 block"
                          >
                            Payment confirmed — view receipt
                          </button>
                        )}

                        {stage === 3 && (() => {
                          const menuShown = !menuSummaryCollapsed[b.id];
                          return (
                            <div className="mt-3 border border-white/10 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1 gap-3">
                                <button
                                  type="button"
                                  aria-expanded={menuShown}
                                  onClick={() =>
                                    setMenuSummaryCollapsed((m) => ({ ...m, [b.id]: menuShown }))
                                  }
                                  className="flex items-center gap-1.5 text-xs font-semibold text-haze hover:text-ink"
                                >
                                  <span aria-hidden className="w-3 text-center text-sm leading-none">
                                    {menuShown ? "−" : "+"}
                                  </span>
                                  Your menu
                                </button>
                                {!menuLocked(b) && (
                                  <button
                                    type="button"
                                    onClick={() => openFinalize(b, { editing: true })}
                                    className="text-xs font-medium text-amber hover:brightness-110"
                                  >
                                    Edit menu
                                  </button>
                                )}
                              </div>
                              {menuShown && (
                                <>
                                  <MenuSummary booking={b} />
                                  {menuLocked(b) && (
                                    <p className="text-xs text-haze/80 mt-2">
                                      Menu changes are locked within 48 hours of your event, so the venue can prepare.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {b.status === "confirmed" && (
                          <div className="mt-3 border border-white/10 rounded-xl p-3">
                            <p className="text-xs font-semibold text-haze mb-1">
                              Check-in code
                            </p>
                            {b.event_started_at ? (
                              <p className="text-sm font-medium text-amber">
                                ✓ Checked in at {fmtDate(b.event_started_at.slice(0, 10))}, {fmtTime(b.event_started_at.slice(11, 16))}
                              </p>
                            ) : (
                              <>
                                {b.checkin_otp ? (
                                  <>
                                    <p className="text-3xl font-bold tracking-[0.35em] text-amber my-1">
                                      {b.checkin_otp}
                                    </p>
                                    <p className="text-xs text-haze">
                                      Show this code to venue staff when you arrive.
                                    </p>
                                    <button
                                      type="button"
                                      disabled={otpBusyId === b.id}
                                      onClick={() => generateCheckinOtp(b)}
                                      className="mt-2 text-sm font-medium text-amber hover:brightness-110 disabled:opacity-50"
                                    >
                                      {otpBusyId === b.id ? "Generating…" : "Regenerate code"}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm text-haze mb-2">
                                      Generate a code to show venue staff at check-in.
                                    </p>
                                    <button
                                      type="button"
                                      disabled={otpBusyId === b.id}
                                      onClick={() => generateCheckinOtp(b)}
                                      className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:brightness-110 transition"
                                    >
                                      {otpBusyId === b.id ? "Generating…" : "Generate check-in code"}
                                    </button>
                                  </>
                                )}
                                {otpError[b.id] && (
                                  <p className="text-xs text-red-300 mt-1">{otpError[b.id]}</p>
                                )}
                                {partialPaid && (
                                  <p className="text-xs text-amber mt-2">
                                    The remaining {100 - pct}% is due directly to the venue at the event —
                                    please arrive at least 30 minutes early to pay it and check in.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {stage === 2 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => openFinalize(b)}
                              className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl hover:brightness-110 transition"
                            >
                              Finalize your menu
                            </button>
                            <p className="text-xs text-haze/80 mt-1">
                              Pick your exact dishes and drinks for this package.
                            </p>
                          </div>
                        )}
                      </>
                    ) : b.status === "completed" ? (
                      <div className="mt-3 border border-white/10 rounded-xl p-3">
                        {fb?.status === "submitted" ? (
                          <>
                            <p className="text-xs font-semibold text-haze mb-1">
                              Your feedback
                            </p>
                            <p className="text-amber text-lg leading-none">
                              {"★".repeat(fb.rating || 0)}
                              <span className="text-white/15">{"★".repeat(5 - (fb.rating || 0))}</span>
                            </p>
                            {fb.comment && (
                              <p className="text-sm text-haze mt-1 whitespace-pre-wrap">{fb.comment}</p>
                            )}
                          </>
                        ) : fb?.status === "skipped" && fbOpenId !== b.id ? (
                          <button
                            type="button"
                            onClick={() => setFbOpenId(b.id)}
                            className="text-sm font-medium text-amber hover:brightness-110"
                          >
                            Leave feedback
                          </button>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-ink mb-1">
                              How was your event at {b.venues?.name}?
                            </p>
                            <div className="flex gap-1 my-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                                  onClick={() =>
                                    setFbDraft((d) => ({ ...d, [b.id]: { ...draft, rating: n } }))
                                  }
                                  className={`text-2xl leading-none ${
                                    draft.rating >= n ? "text-amber" : "text-white/15"
                                  }`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Add a comment (optional)"
                              value={draft.comment}
                              onChange={(e) =>
                                setFbDraft((d) => ({ ...d, [b.id]: { ...draft, comment: e.target.value } }))
                              }
                              className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-sm w-full mt-1 text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                            />
                            {fbError[b.id] && (
                              <p className="text-xs text-red-300 mt-1">{fbError[b.id]}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                disabled={fbBusyId === b.id || !draft.rating}
                                onClick={() =>
                                  saveFeedback(b, fb, {
                                    status: "submitted",
                                    rating: draft.rating,
                                    comment: draft.comment.trim() || null,
                                  })
                                }
                                className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 hover:brightness-110 transition"
                              >
                                {fbBusyId === b.id ? "Saving…" : "Submit"}
                              </button>
                              {fb?.status === "skipped" ? (
                                <button
                                  type="button"
                                  onClick={() => setFbOpenId(null)}
                                  className="text-sm text-haze hover:text-ink px-2"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={fbBusyId === b.id}
                                  onClick={() => saveFeedback(b, fb, { status: "skipped" })}
                                  className="text-sm text-haze hover:text-ink px-2 disabled:opacity-50"
                                >
                                  Skip
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : b.status === "cancelled" ? (
                      <div className="mt-3 border border-red-400/30 bg-red-500/10 rounded-xl p-3">
                        <p className="text-sm font-semibold text-red-200">Request cancelled</p>
                        {b.cancellation_reason && (
                          <p className="text-sm text-haze mt-1 whitespace-pre-wrap">
                            {b.cancellation_reason}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setScreen("browse")}
                          className="mt-2 text-sm font-medium text-amber hover:brightness-110"
                        >
                          Browse other venues
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-haze/70 mt-2 capitalize">
                        Status: {b.status.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}
        {screen === "profile" && (
          <div className="max-w-lg">
            <h1 className="font-display text-3xl font-bold mb-1">Profile</h1>
            <p className="text-haze text-sm mb-6">Keep your details up to date for smoother bookings.</p>
            <form onSubmit={saveProfile} className="flex flex-col gap-4 bg-surface border border-white/10 rounded-2xl p-5 shadow-card">
              <div>
                <label className="text-sm font-medium block mb-1">Full name</label>
                <input
                  type="text"
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Email</label>
                <input
                  type="email"
                  disabled
                  className="border border-white/10 bg-white/[0.03] text-haze rounded-lg px-3 py-2 text-sm w-full"
                  value={profile?.email || session.email}
                />
              </div>
              {profileError && <p className="text-red-300 text-sm">{profileError}</p>}
              {profileSaved && <p className="text-amber text-sm">Profile saved.</p>}
              <button
                disabled={profileLoading}
                className="bg-amber text-[#170D0B] font-medium rounded px-4 py-2 text-sm disabled:opacity-50 self-start"
              >
                {profileLoading ? "Saving…" : "Save changes"}
              </button>
            </form>
          </div>
        )}

        {screen === "settings" && (
          <div className="max-w-lg">
            <h1 className="font-display text-3xl font-bold mb-1">Settings</h1>
            <p className="text-haze text-sm mb-6">Manage your account security.</p>
            <form onSubmit={changePassword} className="flex flex-col gap-4 bg-surface border border-white/10 rounded-2xl p-5 shadow-card">
              <h2 className="text-sm font-medium">Change password</h2>
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                value={settingsPassword}
                onChange={(e) => setSettingsPassword(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm new password"
                className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm w-full text-ink placeholder-haze/50 focus:outline-none focus:border-amber/60"
                value={settingsPasswordConfirm}
                onChange={(e) => setSettingsPasswordConfirm(e.target.value)}
              />
              {settingsError && <p className="text-red-300 text-sm">{settingsError}</p>}
              {settingsSaved && <p className="text-amber text-sm">Password updated.</p>}
              <button
                disabled={settingsLoading}
                className="bg-amber text-[#170D0B] font-medium rounded px-4 py-2 text-sm disabled:opacity-50 self-start"
              >
                {settingsLoading ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>
        )}

        {screen === "finalizeMenu" &&
          (() => {
            const b = myBookings.find((x) => x.id === finalizeId);
            if (!b) return <p className="text-haze/70 text-sm">Booking not found.</p>;
            const ctx = bookingMenuContext(b);
            const showForm = !b.menu_finalized_at || menuEditing;
            const complete = ctx.rules.every(
              (r) => (menuPicks[r.category_kind] || []).length === r.quota_count
            );
            return (
              <div className="max-w-lg">
                <button
                  className="text-sm text-haze hover:text-ink mb-4"
                  onClick={() => {
                    setScreen("myBookings");
                    setFinalizeId(null);
                    setMenuEditing(false);
                  }}
                >
                  ← Back to bookings
                </button>
                <h1 className="font-display text-3xl font-bold mb-1">
                  {menuEditing ? "Edit your menu" : "Finalize your menu"}
                </h1>
                <p className="text-haze text-sm mb-5">
                  {b.venue_packages?.name} at {b.venues?.name}
                  <span className="block text-amber font-medium">{b.booking_ref}</span>
                </p>

                {!showForm ? (
                  <div className="bg-surface border border-white/10 rounded-2xl p-4 shadow-card">
                    <p className="text-sm font-medium text-amber mb-2">✓ Your menu is confirmed</p>
                    <MenuSummary booking={b} />
                  </div>
                ) : ctx.rules.length === 0 ? (
                  <p className="text-sm text-haze">This package has no menu choices to make.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {ctx.rules.map((r) => {
                      const opts = ctx.optionsForKind(r.category_kind);
                      const picked = menuPicks[r.category_kind] || [];
                      return (
                        <div key={r.category_kind} className="bg-surface border border-white/10 rounded-2xl p-4 shadow-card">
                          <p className="text-sm font-medium mb-1 text-ink">
                            Choose <span className="text-amber font-semibold">{r.quota_count}</span> {quotaLabel(r.category_kind, r.quota_count)}
                            <span
                              className={`ml-2 text-xs ${
                                picked.length === r.quota_count ? "text-amber" : "text-haze/60"
                              }`}
                            >
                              ({picked.length}/{r.quota_count})
                            </span>
                          </p>
                          {opts.length === 0 ? (
                            <p className="text-sm text-haze/70">No options available for this category.</p>
                          ) : (
                            <div className="flex flex-col gap-1.5 mt-1">
                              {opts.map((it) => {
                                const on = picked.includes(it.id);
                                const disabled = !it.is_available;
                                return (
                                  <label
                                    key={it.id}
                                    className={`flex items-center gap-2 text-sm ${disabled ? "text-haze/50" : "text-ink"}`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="accent-amber"
                                      checked={on}
                                      disabled={disabled}
                                      onChange={() => togglePick(r.category_kind, it.id, r.quota_count)}
                                    />
                                    <span>
                                      {it.name}
                                      {disabled && " (currently unavailable)"}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {finalizeError && <p className="text-red-300 text-sm">{finalizeError}</p>}

                    <button
                      type="button"
                      disabled={!complete || finalizeBusy}
                      onClick={() => submitMenu(b)}
                      className="bg-amber text-[#170D0B] text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 self-start hover:brightness-110 transition"
                    >
                      {finalizeBusy ? "Saving…" : menuEditing ? "Save changes" : "Submit menu"}
                    </button>
                    {menuEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuEditing(false);
                          setScreen("myBookings");
                          setFinalizeId(null);
                        }}
                        className="text-sm text-haze hover:text-ink self-start"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        {screen === "help" && (
          <div className="max-w-lg">
            <h1 className="font-display text-3xl font-bold mb-1">Help &amp; support</h1>
            <p className="text-haze text-sm mb-6">We're here if something doesn't look right.</p>
            <div className="bg-surface border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-card">
              <div>
                <p className="text-sm font-medium text-ink">Email us</p>
                <p className="text-sm text-haze">hello.mypaxo@gmail.com</p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-sm font-medium text-ink mb-1">Common questions</p>
                <ul className="text-sm text-haze list-disc pl-4 flex flex-col gap-1">
                  <li>How long does a venue have to respond to my request? Up to 2 hours.</li>
                  <li>When do I pay the rest of the bill? Directly at the venue, unless you paid in full.</li>
                  <li>Can I cancel an express booking? No — bookings under 72 hours are final once confirmed.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {reviewPkg && screen === "venue" && selectedVenue && (
        <Modal title={`${reviewPkg.name} — what's on the menu`} onClose={() => setReviewPkg(null)}>
          <ReviewMenuBody pkg={reviewPkg} venue={selectedVenue} />
        </Modal>
      )}

      {receiptId &&
        screen === "myBookings" &&
        (() => {
          const b = myBookings.find((x) => x.id === receiptId);
          if (!b) return null;
          const paid = (b.payments || []).filter((p) => p.status === "paid");
          const amountPaid = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
          const paymentRef = paid.find((p) => p.razorpay_payment_id)?.razorpay_payment_id || null;
          return (
            <Modal title="Receipt" onClose={() => setReceiptId(null)}>
              <ReceiptBody
                booking={b}
                amountPaid={amountPaid}
                paymentRef={paymentRef}
                onFinalize={() => openFinalize(b)}
              />
            </Modal>
          );
        })()}

      {session && (
        <nav
          className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-base/95 backdrop-blur border-t border-white/10 flex items-stretch"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {[
            { key: "browse", label: "Venues", Icon: MapPin },
            { key: "myBookings", label: "Bookings", Icon: CalendarCheck },
            { key: "profile", label: "Profile", Icon: User },
          ].map(({ key, label, Icon }) => {
            const active = screen === key;
            return (
              <button
                key={key}
                type="button"
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                  active ? "text-amber" : "text-haze/70"
                }`}
                onClick={() => setScreen(key)}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
