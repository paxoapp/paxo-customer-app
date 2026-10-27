// "Chat with PAXO on WhatsApp": one number, one place. Change WHATSAPP_NUMBER here and every button follows.
// No customer data is ever put in the message or the link: only the venue name or the booking reference.
export const WHATSAPP_NUMBER = "919625261665"; // +91 96252 61665

const GENERIC_MESSAGE = "Hi PAXO, I have a question.";

export function whatsappLink(message = GENERIC_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Which message to pre-fill, from where the customer is right now.
//   venue page (and the booking request form for a venue) -> the venue name
//   a booking's own screens (Your Menu, receipts)         -> that booking's reference
//   everywhere else                                       -> the generic line
export function whatsappContext({ screen, selectedVenue, myBookings, yourMenuId, receiptId, refundReceiptId }) {
  if ((screen === "venue" || screen === "request") && selectedVenue?.name) {
    return { pageType: "venue", message: `Hi PAXO, I have a question about ${selectedVenue.name}.` };
  }
  const bookingId = screen === "yourMenu" ? yourMenuId : screen === "myBookings" ? receiptId || refundReceiptId : null;
  const ref = bookingId ? (myBookings || []).find((b) => b.id === bookingId)?.booking_ref : null;
  if (ref) return { pageType: "booking", message: `Hi PAXO, I need help with my booking ${ref}.` };
  return { pageType: "other", message: GENERIC_MESSAGE };
}

// Official WhatsApp glyph, drawn inline (no external image).
export function WhatsAppIcon({ className = "w-6 h-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

// Floating button, bottom-right on every page. It sits ABOVE the existing "Find my venue" button and the mobile
// bottom tab bar (which carries the safe-area padding), so it never covers them or a sticky bar.
export function WhatsAppFloat({ message, pageType, aboveFind, hasTabBar }) {
  const pos = aboveFind
    ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))] sm:bottom-20"
    : hasTabBar
    ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6"
    : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-6";
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with PAXO on WhatsApp"
      data-testid="whatsapp-float"
      data-page-type={pageType}
      className={`fixed z-30 right-5 ${pos} h-12 min-w-[3rem] sm:pl-4 sm:pr-5 justify-center rounded-full bg-[#25D366] text-white shadow-hero ring-1 ring-white/20 flex items-center gap-2 text-sm font-semibold hover:brightness-110 transition`}
    >
      <WhatsAppIcon className="w-6 h-6 shrink-0" />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  );
}

// A normal row / link for the Profile page and the footer (always the generic message).
export function WhatsAppRow({ className = "" }) {
  return (
    <a
      href={whatsappLink(GENERIC_MESSAGE)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-row"
      className={`flex items-center gap-3 bg-surface border border-white/10 rounded-2xl p-4 shadow-card text-sm text-ink hover:border-[#25D366]/60 transition-colors ${className}`}
    >
      <span className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0">
        <WhatsAppIcon className="w-5 h-5" />
      </span>
      <span className="flex-1 font-medium">Chat with us on WhatsApp</span>
    </a>
  );
}

export function WhatsAppFooterLink() {
  return (
    <a
      href={whatsappLink(GENERIC_MESSAGE)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-footer"
      className="inline-flex items-center gap-1.5 text-xs text-haze/60 hover:text-[#25D366] transition-colors"
    >
      <WhatsAppIcon className="w-4 h-4" />
      Chat with us on WhatsApp
    </a>
  );
}
