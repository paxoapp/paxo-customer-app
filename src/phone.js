// Indian mobile numbers. ONE rule, used by the request form, the profile and the payment screen, and mirrored (same
// text) in supabase/cashfree/functions/create-cashfree-order.ts so the browser and the server always agree.
//   - strip spaces, dashes, brackets and a leading "+"
//   - what is left must be digits only, and exactly 10 digits, or "0" + 10 digits, or "91" + 10 digits
//   - the final 10 digits must start with 6-9
// Returns the 10 digits, or null. Nothing is ever cut: 11 digits not starting with 0, 12 not starting with 91,
// or any stray character, make the number invalid.
export function normalizeIndianMobile(raw) {
  const s = String(raw ?? "").trim().replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(s)) return null;
  let n = null;
  if (s.length === 10) n = s;
  else if (s.length === 11 && s.startsWith("0")) n = s.slice(1);
  else if (s.length === 12 && s.startsWith("91")) n = s.slice(2);
  return n && /^[6-9]\d{9}$/.test(n) ? n : null;
}

export const MOBILE_ERROR = "Enter a valid 10-digit Indian mobile number.";
