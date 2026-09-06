import { useState, useEffect, useCallback } from "react";
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

const FOOD_QUOTA_KINDS = ["starter_veg", "starter_non_veg", "main_veg", "main_non_veg", "dessert"];
// Hard-liquor categories where a package restricts choice to a specific brand pool.
const POOL_QUOTA_KINDS = ["whisky", "vodka", "gin", "rum", "beer", "wine"];

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
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <p className="font-medium">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
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

  const ItemList = ({ items }) =>
    items.length ? (
      <ul className="list-disc pl-5 text-sm text-stone-600 flex flex-col gap-0.5">
        {items.map((it) => (
          <li key={it.id} className={it.is_available ? "" : "text-stone-400"}>
            {it.name}
            {!it.is_available && " (currently unavailable)"}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-stone-400">No items listed yet.</p>
    );

  const Group = ({ kind, items }) => (
    <div className="mb-3 last:mb-0">
      <p className="text-sm font-medium text-stone-700 mb-1">
        Choose {quotaFor(kind)} {quotaLabel(kind, quotaFor(kind))}
      </p>
      <ItemList items={items} />
    </div>
  );

  const nothing =
    foodKinds.length === 0 && drinkKinds.length === 0 && !pkg.inclusions?.length;

  return (
    <div>
      {foodKinds.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">Food</h3>
          {foodKinds.map((k) => (
            <Group key={k} kind={k} items={itemsForKind(k)} />
          ))}
        </div>
      )}

      {drinkKinds.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">
            Drinks included in this package
          </h3>
          {drinkKinds.map((k) => (
            <Group key={k} kind={k} items={itemsForKind(k).filter((it) => poolIds.has(it.id))} />
          ))}
        </div>
      )}

      {pkg.inclusions?.length > 0 && (
        <div className="mb-5 last:mb-0">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">Also included</h3>
          <ul className="list-disc pl-5 text-sm text-stone-600 flex flex-col gap-0.5">
            {pkg.inclusions.map((inc, i) => (
              <li key={i}>{inc}</li>
            ))}
          </ul>
        </div>
      )}

      {nothing && <p className="text-sm text-stone-400">No menu details for this package yet.</p>}
    </div>
  );
}

function VenueCardSkeleton() {
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white animate-pulse">
      <div className="w-full h-40 bg-stone-200" />
      <div className="p-4">
        <div className="h-4 bg-stone-200 rounded w-2/3 mb-2" />
        <div className="h-3 bg-stone-200 rounded w-1/3 mb-3" />
        <div className="h-3 bg-stone-200 rounded w-full mb-1" />
        <div className="h-3 bg-stone-200 rounded w-5/6" />
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
  const [pendingPackage, setPendingPackage] = useState(null); // { venue, pkg } saved when booking is requested before login

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
        "/rest/v1/bookings?select=*,venues(name),venue_packages(name),payments(payment_type,status,amount,paid_at)&order=created_at.desc",
        { token }
      );
      setMyBookings(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Deposit payment via Razorpay Checkout. Amount is computed server-side by
  // the create-razorpay-order function — never sent from here.
  async function payDeposit(booking) {
    setPayError((m) => ({ ...m, [booking.id]: "" }));
    setPayingBookingId(booking.id);
    try {
      if (!window.Razorpay) {
        throw new Error("Payment library didn't load — please refresh and try again.");
      }
      const order = await callFn("create-razorpay-order", session.token, {
        booking_id: booking.id,
        payment_type: "deposit",
      });

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "PAXO",
        description: `Deposit — ${booking.venues?.name || "venue booking"}`,
        prefill: {
          name: booking.contact_name || profile?.full_name || "",
          email: booking.contact_email || session.email || "",
          contact: booking.contact_mobile || profile?.phone || "",
        },
        theme: { color: "#f59e0b" },
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
    pending: "bg-amber-100 text-amber-800",
    accepted: "bg-blue-100 text-blue-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    completed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    cancelled: "bg-rose-100 text-rose-800",
    unconfirmed: "bg-stone-200 text-stone-800",
    no_show: "bg-rose-100 text-rose-800",
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
      <div className="min-h-screen bg-gradient-to-br from-rose-950 via-stone-950 to-amber-950 text-white flex flex-col justify-center px-6 py-10 overflow-hidden">
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
            className="text-sm text-stone-400 mb-6"
            onClick={() => {
              setPendingPackage(null);
              setScreen("browse");
            }}
          >
            ← Back to browsing
          </button>
          <h1 className="uppercase font-black leading-[0.95] tracking-tight mb-5">
            <span className="block text-5xl">
              <span className="text-white">Book</span>{" "}
              <span className="text-amber-500">venues</span>
            </span>
            <span className="block text-5xl text-white">without the wait</span>
          </h1>
        </div>

        <div className="w-full mb-5 flex flex-col gap-3">
          <div className="overflow-hidden">
            <div className="marquee-track marquee-left">
              {[...chipsRow1, ...chipsRow1].map((c, i) => (
                <span key={i} className="whitespace-nowrap text-sm text-stone-300 border border-amber-800 rounded-full px-4 py-2">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="marquee-track marquee-right">
              {[...chipsRow2, ...chipsRow2].map((c, i) => (
                <span key={i} className="whitespace-nowrap text-sm text-stone-300 border border-amber-800 rounded-full px-4 py-2">
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
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-sky-500 via-rose-500 to-amber-400 inline-block" />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-stone-700" />
            <span className="text-xs text-stone-500">or</span>
            <div className="flex-1 h-px bg-stone-700" />
          </div>

          <form onSubmit={handleAuth} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="Enter email address"
              className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            {authNotice && <p className="text-emerald-400 text-sm px-1">{authNotice}</p>}
            {authError && (
              <div className="flex flex-col gap-1">
                <p className="text-rose-400 text-sm px-1">{authError}</p>
                {/confirmed/i.test(authError) && (
                  <button type="button" className="text-amber-500 text-xs text-left px-1" onClick={resendConfirmation}>
                    Resend confirmation email
                  </button>
                )}
              </div>
            )}
            {authMode === "login" && (
              <button
                type="button"
                className="text-amber-500 text-xs text-right -mt-1"
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
              className="bg-amber-500 text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50 mt-1"
            >
              {authLoading ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-center text-stone-500 text-sm mt-6">
            {authMode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-amber-500 font-medium"
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
      <div className="min-h-screen bg-gradient-to-br from-rose-950 via-stone-950 to-amber-950 text-white flex flex-col justify-center px-6 py-16">
        <div className="max-w-sm mx-auto w-full">
          <button className="text-sm text-stone-400 mb-6" onClick={() => setScreen("auth")}>
            ← Back to sign in
          </button>
          <h1 className="font-black text-3xl mb-1">Reset your password</h1>
          <p className="text-stone-400 text-sm mb-6">
            We'll help you set a new password using your email or phone number.
          </p>

          <div className="flex gap-2 mb-6">
            <button
              className={`flex-1 rounded-full py-2 text-sm font-medium ${
                resetMethod === "email" ? "bg-amber-500 text-stone-900" : "border border-stone-700 text-stone-300"
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
                resetMethod === "phone" ? "bg-amber-500 text-stone-900" : "border border-stone-700 text-stone-300"
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
                className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              {resetError && <p className="text-rose-400 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber-500 text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {resetMethod === "email" && resetStep === "sent" && (
            <div className="border border-emerald-800 bg-emerald-950 rounded-lg p-4 text-sm text-emerald-200">
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
                className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
                value={resetPhone}
                onChange={(e) => setResetPhone(e.target.value)}
              />
              {resetError && <p className="text-rose-400 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber-500 text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetLoading ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {resetMethod === "phone" && resetStep === "verify" && (
            <form onSubmit={verifyPhoneOtpAndReset} className="flex flex-col gap-3">
              <p className="text-stone-400 text-xs -mt-1">Code sent to {resetPhone}</p>
              <input
                type="text"
                required
                placeholder="6-digit code"
                className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
              />
              {resetError && <p className="text-rose-400 text-sm px-1">{resetError}</p>}
              <button
                disabled={resetLoading}
                className="bg-amber-500 text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
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
      <div className="min-h-screen bg-gradient-to-br from-rose-950 via-stone-950 to-amber-950 text-white flex flex-col justify-center px-6 py-16">
        <div className="max-w-sm mx-auto w-full">
          <h1 className="font-black text-3xl mb-1">Set a new password</h1>
          <p className="text-stone-400 text-sm mb-6">Choose a new password for your account.</p>
          <form onSubmit={submitNewPassword} className="flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm new password"
              className="bg-stone-900 border border-amber-900 rounded-full px-5 py-3.5 text-sm placeholder-stone-500 text-white focus:outline-none focus:border-amber-600"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
            />
            {newPasswordError && <p className="text-rose-400 text-sm px-1">{newPasswordError}</p>}
            <button
              disabled={newPasswordLoading}
              className="bg-amber-500 text-stone-900 rounded-full px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              {newPasswordLoading ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20 sm:pb-0">
      <style>{`
        @keyframes screenFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .screen-fade { animation: screenFadeIn 0.2s ease-out; }
      `}</style>
      <header className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-2 cursor-pointer" onClick={() => setScreen("browse")}>
            <span className="font-serif text-2xl tracking-tight">Paxo</span>
            <span className="text-xs text-slate-400 hidden sm:inline">venue bookings</span>
          </div>
          {session ? (
            <nav className="flex items-center gap-4 text-sm relative">
              <div className="hidden sm:flex items-center gap-4">
                <button
                  className={`hover:text-amber-400 ${screen === "browse" ? "text-amber-400" : "text-slate-300"}`}
                  onClick={() => setScreen("browse")}
                >
                  Venues
                </button>
                <button
                  className={`hover:text-amber-400 ${screen === "myBookings" ? "text-amber-400" : "text-slate-300"}`}
                  onClick={() => setScreen("myBookings")}
                >
                  My bookings
                </button>
                <button
                  className={`hover:text-amber-400 ${screen === "profile" ? "text-amber-400" : "text-slate-300"}`}
                  onClick={() => setScreen("profile")}
                >
                  Profile
                </button>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-amber-500 text-slate-900 font-semibold flex items-center justify-center text-xs"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {(session.email || "?").slice(0, 1).toUpperCase()}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 w-48 bg-white text-stone-900 rounded-lg border border-stone-200 shadow-lg overflow-hidden z-10">
                  <p className="px-4 py-3 text-xs text-stone-400 border-b border-stone-100 truncate">{session.email}</p>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50" onClick={() => { setScreen("profile"); setMenuOpen(false); }}>
                    Profile
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50" onClick={() => { setScreen("myBookings"); setMenuOpen(false); }}>
                    My bookings
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50" onClick={() => { setScreen("settings"); setMenuOpen(false); }}>
                    Settings
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm hover:bg-stone-50" onClick={() => { setScreen("help"); setMenuOpen(false); }}>
                    Help & support
                  </button>
                  <button className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-stone-50 border-t border-stone-100" onClick={logOut}>
                    Log out
                  </button>
                </div>
              )}
            </nav>
          ) : (
            <button
              className="bg-amber-500 text-slate-900 text-sm font-semibold px-4 py-1.5 rounded-full"
              onClick={() => setScreen("auth")}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main key={screen} className="max-w-4xl mx-auto px-5 py-8 screen-fade">
        {screen === "browse" && (
          <div>
            <h1 className="font-serif text-3xl mb-1">Find a venue</h1>
            <p className="text-stone-500 text-sm mb-5">Browse approved venues and request a booking.</p>

            {venues.length > 0 && (
              <div
                className="relative rounded-lg overflow-hidden h-52 mb-6 cursor-pointer"
                onClick={() => openVenue(venues[heroIndex % venues.length])}
              >
                <img
                  src={
                    venues[heroIndex % venues.length].venue_images?.[0]?.image_url ||
                    venues[heroIndex % venues.length].cover_image_url
                  }
                  alt={venues[heroIndex % venues.length].name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4 text-white">
                  <p className="font-serif text-2xl">{venues[heroIndex % venues.length].name}</p>
                  <p className="text-sm text-stone-200">
                    {venues[heroIndex % venues.length].area ? `${venues[heroIndex % venues.length].area}, ` : ""}
                    {venues[heroIndex % venues.length].city}
                  </p>
                  {minPackagePrice(venues[heroIndex % venues.length]) != null && (
                    <p className="text-sm text-amber-400 font-medium mt-1">
                      Unlimited packages starting{" "}
                      {inr(minPackagePrice(venues[heroIndex % venues.length]))} / head
                    </p>
                  )}
                </div>
                <div className="absolute bottom-3 right-4 flex gap-1">
                  {venues.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${i === heroIndex % venues.length ? "bg-amber-400" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                className={`text-sm px-3 py-1.5 rounded-full border ${
                  selectedCity === null ? "bg-slate-900 text-white border-slate-900" : "border-stone-300 text-stone-600"
                }`}
                onClick={() => setSelectedCity(null)}
              >
                All cities
              </button>
              {CITIES.map((c) => (
                <button
                  key={c}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    selectedCity === c ? "bg-slate-900 text-white border-slate-900" : "border-stone-300 text-stone-600"
                  }`}
                  onClick={() => setSelectedCity(c)}
                >
                  {c}
                </button>
              ))}
              <select
                className="text-sm px-3 py-1.5 rounded-full border border-stone-300 text-stone-600 bg-white sm:ml-auto"
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value)}
              >
                <option value="">Sort by price</option>
                <option value="asc">Price: Low to High</option>
                <option value="desc">Price: High to Low</option>
              </select>
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
                    className="border border-stone-200 rounded-lg overflow-hidden bg-white cursor-pointer hover:border-stone-400 transition"
                    onClick={() => openVenue(v)}
                  >
                    <img
                      src={v.venue_images?.[0]?.image_url || v.cover_image_url}
                      alt={v.name}
                      className="w-full h-40 object-cover"
                    />
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-serif text-lg">{v.name}</h3>
                        {v.is_verified && (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                            ✓ Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mb-2">
                        {v.area ? `${v.area}, ` : ""}
                        {v.city}
                        {v.venue_type ? ` · ${v.venue_type}` : ""}
                      </p>
                      <p className="text-sm text-stone-600 line-clamp-2">{v.description}</p>
                      {minPackagePrice(v) != null && (
                        <p className="text-sm font-medium text-amber-700 mt-2">
                          Unlimited packages starting {inr(minPackagePrice(v))}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {v.serves_alcohol && (
                          <span className="inline-block text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                            Serves alcohol
                          </span>
                        )}
                        {v.guest_capacity && (
                          <span className="inline-block text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                            Up to {v.guest_capacity} guests
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="mt-3 w-full bg-amber-500 text-slate-900 text-sm font-semibold py-2 rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVenue(v);
                        }}
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                ))}
                {visibleVenues.length === 0 && (
                  <p className="text-stone-400 text-sm col-span-2">No venues in {selectedCity} yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {screen === "venue" && selectedVenue && (
          <div>
            <button className="text-sm text-stone-500 mb-4" onClick={() => setScreen("browse")}>
              ← Back to venues
            </button>
            <img
              src={selectedVenue.venue_images?.[0]?.image_url || selectedVenue.cover_image_url}
              alt={selectedVenue.name}
              className="w-full h-56 object-cover rounded-lg mb-4"
            />
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="font-serif text-3xl">{selectedVenue.name}</h1>
              {selectedVenue.is_verified && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500 mb-4">
              <span>
                {selectedVenue.address || `${selectedVenue.area}, ${selectedVenue.city}`}
                {selectedVenue.venue_type ? ` · ${selectedVenue.venue_type}` : ""}
              </span>
              {selectedVenue.guest_capacity && (
                <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                  Up to {selectedVenue.guest_capacity} guests
                </span>
              )}
            </div>
            <p className="text-stone-700 mb-6">{selectedVenue.description}</p>
            <h2 className="text-lg font-medium mb-3">Unlimited Packages</h2>
            <div className="flex flex-col gap-3">
              {selectedVenue.venue_packages?.map((p) => (
                <div key={p.id} className="border border-stone-200 rounded-lg p-4 flex items-start justify-between gap-4 bg-white">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-stone-500">{p.description}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      {p.min_headcount}–{p.max_headcount || "∞"} guests
                      {p.duration_hours ? ` · ${p.duration_hours} hrs` : ""}
                    </p>
                    {(() => {
                      const quotas = [...(p.menu_quota_rules || [])].sort((a, b) =>
                        a.category_kind.localeCompare(b.category_kind)
                      );
                      const food = quotas.filter((q) => FOOD_QUOTA_KINDS.includes(q.category_kind));
                      const bev = quotas.filter((q) => !FOOD_QUOTA_KINDS.includes(q.category_kind));
                      const line = (q) =>
                        `Choose ${q.quota_count} ${quotaLabel(q.category_kind, q.quota_count)}`;
                      return (
                        <>
                          {food.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                                Food
                              </p>
                              <ul className="list-disc pl-4 text-xs text-stone-500 flex flex-col gap-0.5">
                                {food.map((q) => (
                                  <li key={q.id}>{line(q)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(bev.length > 0 || p.inclusions?.length > 0) && (
                            <div className="mt-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                                Beverages
                              </p>
                              <ul className="list-disc pl-4 text-xs text-stone-500 flex flex-col gap-0.5">
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
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <p className="font-medium">{inr(p.price_per_head)} / head</p>
                    <button
                      className="bg-amber-500 text-slate-900 text-sm font-medium px-3 py-1.5 rounded"
                      onClick={() => selectPackage(p)}
                    >
                      Select Package
                    </button>
                    <button
                      type="button"
                      className="border border-stone-300 text-stone-600 text-sm px-3 py-1.5 rounded"
                      onClick={() => setReviewPkg(p)}
                    >
                      Review Menu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === "request" && selectedVenue && !submitted && (
          <div className="max-w-lg">
            <button className="text-sm text-stone-500 mb-4" onClick={() => setScreen("venue")}>
              ← Back to {selectedVenue.name}
            </button>
            <h1 className="font-serif text-3xl mb-4">Request a booking</h1>

            <div className="border border-stone-200 rounded-lg p-4 bg-stone-50 text-sm mb-6">
              <p className="font-medium">{selectedVenue.name}</p>
              <p className="text-stone-500 text-xs mb-2">
                {selectedVenue.area ? `${selectedVenue.area}, ` : ""}
                {selectedVenue.city}
              </p>
              <div className="flex justify-between text-xs text-stone-600 pt-2 border-t border-stone-200">
                <span>{selectedPackage?.name}</span>
                <span>{inr(selectedPackage?.price_per_head || 0)} / person</span>
              </div>
            </div>

            <form onSubmit={submitRequest} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                    value={form.contact_mobile}
                    onChange={(e) => setForm({ ...form, contact_mobile: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
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
                  className="border border-stone-200 bg-stone-100 text-stone-500 rounded px-3 py-2 text-sm w-full"
                  value={selectedVenue.city}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Occasion</label>
                <select
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={form.booking_type_id}
                  onChange={(e) => setForm({ ...form, booking_type_id: e.target.value })}
                >
                  <option value="">Select an occasion</option>
                  {bookingTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {selectedBookingType?.name === "Other" && (
                <div>
                  <label className="text-sm font-medium block mb-1">Please specify occasion</label>
                  <input
                    type="text"
                    required
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
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
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                    value={form.event_date}
                    onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Party Slot Timing</label>
                  <input
                    type="time"
                    required
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                    value={form.event_time}
                    onChange={(e) => setForm({ ...form, event_time: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Slot</label>
                <select
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={form.slot}
                  onChange={(e) => setForm({ ...form, slot: e.target.value })}
                >
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Evening</option>
                  <option>Night</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Male</label>
                  <input
                    type="number"
                    min="0"
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                    value={form.male_count}
                    onChange={(e) => setForm({ ...form, male_count: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Female</label>
                  <input
                    type="number"
                    min="0"
                    className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                    value={form.female_count}
                    onChange={(e) => setForm({ ...form, female_count: e.target.value })}
                  />
                </div>
              </div>

              <div className="bg-stone-100 rounded px-3 py-2 text-sm flex justify-between items-center">
                <span className="text-stone-500">Total Guest Count</span>
                <span className="font-medium">{headcountNum}</span>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Special Request / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Tell the venue about any special requirements for your event"
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={form.special_request}
                  onChange={(e) => setForm({ ...form, special_request: e.target.value })}
                />
              </div>

              {headcountNum > 0 && (
                <div className="bg-stone-100 rounded-lg p-4 text-sm">
                  <h3 className="font-medium text-stone-700 mb-2">Booking Summary</h3>
                  <div className="flex justify-between mb-1">
                    <span className="text-stone-500">{selectedPackage?.name} × {headcountNum} guests</span>
                    <span className="text-stone-500">{inr(selectedPackage?.price_per_head || 0)} / head</span>
                  </div>
                  <div className="flex justify-between mb-2 pb-2 border-b border-stone-200 font-semibold text-base">
                    <span>Estimated Package Value</span>
                    <span>{inr(totalPreview)}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-stone-500">{preview.bookingCategory}</span>
                    <span className="font-medium">{preview.tier}</span>
                  </div>
                  <p className="text-xs text-stone-400">{preview.reason}</p>
                </div>
              )}

              {hrs !== null && hrs >= 0 && hrs < 72 && (
                <div className="border border-rose-300 bg-rose-50 rounded-lg p-4 text-sm">
                  <p className="font-medium text-rose-800 mb-1">This is an Express Booking</p>
                  <p className="text-rose-700 mb-3">
                    Your event is less than 72 hours away. If accepted, full payment is required
                    immediately and this booking cannot be cancelled once confirmed.
                  </p>
                  <label className="flex items-start gap-2 text-rose-800">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.ack}
                      onChange={(e) => setForm({ ...form, ack: e.target.checked })}
                    />
                    <span>I understand this booking is non-cancellable and requires full payment upfront.</span>
                  </label>
                </div>
              )}

              <div className="border border-stone-200 rounded-lg p-4 text-xs text-stone-500 max-h-32 overflow-y-auto">
                <p className="font-medium text-stone-700 mb-1">Booking terms & conditions</p>
                <ul className="list-disc pl-4 flex flex-col gap-1">
                  <li>The venue has up to 2 hours to accept or reject your request.</li>
                  <li>Your deposit is due immediately once the venue accepts.</li>
                  <li>The remaining balance is paid directly to the venue at the event.</li>
                  <li>Express Bookings (made under 72 hours before the event) require full payment and cannot be cancelled.</li>
                  <li>Cancellations 72+ hours before the event are refunded minus a flat ₹2,000 admin fee; later cancellations forfeit more of the deposit to the venue.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.tc_agree}
                  onChange={(e) => setForm({ ...form, tc_agree: e.target.checked })}
                />
                <span>I have read and agree to the Terms & Conditions above.</span>
              </label>

              {submitError && <p className="text-rose-600 text-sm">{submitError}</p>}

              <button
                disabled={submitLoading}
                className="bg-amber-500 text-slate-900 font-medium rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {submitLoading ? "Submitting…" : "Submit request"}
              </button>
            </form>
          </div>
        )}

        {screen === "request" && submitted && (
          <div className="max-w-lg">
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-6 text-center">
              <h2 className="font-serif text-2xl text-emerald-900 mb-2">Request sent</h2>
              <p className="text-emerald-800 text-sm mb-4">
                {selectedVenue.name} has up to 2 hours to respond. You'll see the status update under
                "My requests".
              </p>
              <button
                className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded"
                onClick={() => setScreen("myBookings")}
              >
                View my requests
              </button>
            </div>
          </div>
        )}

        {screen === "myBookings" && (
          <div>
            <h1 className="font-serif text-3xl mb-1">My requests</h1>
            <p className="text-stone-500 text-sm mb-6">Track the status of every booking you've requested.</p>
            {myBookings.length === 0 && (
              <p className="text-stone-400 text-sm">You haven't requested any bookings yet.</p>
            )}
            <div className="flex flex-col gap-3">
              {myBookings.map((b) => {
                const depositPaid = b.payments?.some(
                  (p) => p.payment_type === "deposit" && p.status === "paid"
                );
                return (
                  <div key={b.id} className="border border-stone-200 rounded-lg p-4 bg-white flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{b.venues?.name}</p>
                      <p className="text-sm text-stone-500">
                        {b.venue_packages?.name} · {b.event_date} · {b.headcount} guests
                      </p>
                      <p className="text-xs text-stone-400 mt-1">
                        {b.deposit_tier === "full" ? "Full payment" : b.deposit_tier === "50pct" ? "50% deposit" : "20% deposit"}
                        {" · "}
                        {inr(b.deposit_amount)} {depositPaid ? "paid" : "due"}
                      </p>

                      {depositPaid ? (
                        <p className="text-sm font-medium text-emerald-700 mt-2">✓ Payment confirmed</p>
                      ) : b.status === "accepted" ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            disabled={payingBookingId === b.id}
                            onClick={() => payDeposit(b)}
                            className="bg-amber-500 text-slate-900 text-sm font-semibold px-3 py-1.5 rounded disabled:opacity-50"
                          >
                            {payingBookingId === b.id ? "Opening…" : `Pay Deposit · ${inr(b.deposit_amount)}`}
                          </button>
                          {payError[b.id] && (
                            <p className="text-xs text-rose-600 mt-1">{payError[b.id]}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${statusColor[b.status] || "bg-stone-100 text-stone-700"}`}>
                      {b.status.replace("_", " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {screen === "profile" && (
          <div className="max-w-lg">
            <h1 className="font-serif text-3xl mb-1">Profile</h1>
            <p className="text-stone-500 text-sm mb-6">Keep your details up to date for smoother bookings.</p>
            <form onSubmit={saveProfile} className="flex flex-col gap-4 bg-white border border-stone-200 rounded-lg p-5">
              <div>
                <label className="text-sm font-medium block mb-1">Full name</label>
                <input
                  type="text"
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Email</label>
                <input
                  type="email"
                  disabled
                  className="border border-stone-200 bg-stone-100 text-stone-500 rounded px-3 py-2 text-sm w-full"
                  value={profile?.email || session.email}
                />
              </div>
              {profileError && <p className="text-rose-600 text-sm">{profileError}</p>}
              {profileSaved && <p className="text-emerald-600 text-sm">Profile saved.</p>}
              <button
                disabled={profileLoading}
                className="bg-amber-500 text-slate-900 font-medium rounded px-4 py-2 text-sm disabled:opacity-50 self-start"
              >
                {profileLoading ? "Saving…" : "Save changes"}
              </button>
            </form>
          </div>
        )}

        {screen === "settings" && (
          <div className="max-w-lg">
            <h1 className="font-serif text-3xl mb-1">Settings</h1>
            <p className="text-stone-500 text-sm mb-6">Manage your account security.</p>
            <form onSubmit={changePassword} className="flex flex-col gap-4 bg-white border border-stone-200 rounded-lg p-5">
              <h2 className="text-sm font-medium">Change password</h2>
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                value={settingsPassword}
                onChange={(e) => setSettingsPassword(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm new password"
                className="border border-stone-300 rounded px-3 py-2 text-sm w-full"
                value={settingsPasswordConfirm}
                onChange={(e) => setSettingsPasswordConfirm(e.target.value)}
              />
              {settingsError && <p className="text-rose-600 text-sm">{settingsError}</p>}
              {settingsSaved && <p className="text-emerald-600 text-sm">Password updated.</p>}
              <button
                disabled={settingsLoading}
                className="bg-amber-500 text-slate-900 font-medium rounded px-4 py-2 text-sm disabled:opacity-50 self-start"
              >
                {settingsLoading ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>
        )}

        {screen === "help" && (
          <div className="max-w-lg">
            <h1 className="font-serif text-3xl mb-1">Help & support</h1>
            <p className="text-stone-500 text-sm mb-6">We're here if something doesn't look right.</p>
            <div className="bg-white border border-stone-200 rounded-lg p-5 flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium">Email us</p>
                <p className="text-sm text-stone-500">hello.mypaxo@gmail.com</p>
              </div>
              <div className="border-t border-stone-100 pt-4">
                <p className="text-sm font-medium mb-1">Common questions</p>
                <ul className="text-sm text-stone-500 list-disc pl-4 flex flex-col gap-1">
                  <li>How long does a venue have to respond to my request? Up to 2 hours.</li>
                  <li>When do I pay the rest of the bill? Directly at the venue, unless you paid in full.</li>
                  <li>Can I cancel an Express Booking? No — bookings under 72 hours are final once confirmed.</li>
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

      {session && (
        <nav
          className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-stone-200 flex items-stretch"
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
                  active ? "text-amber-600" : "text-stone-400"
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
