// Approved copy for the legal pages (/terms, /privacy, /refund, /contact). Word for word as supplied.
// Used by the app (src/legalPages.jsx) AND by scripts/make-about.mjs (static copy for crawlers / no-JavaScript).
// Block types: p (paragraph), h (small heading), ol ([head|null, text] items), ul (text items),
// table (head + rows), contact ({label, value, href?} items).
export const LEGAL_UPDATED = "Last updated: 5 November 2026";
// The refund timeline sentence. The /refund page and the customer's refund receipt both read it from here, so they cannot drift.
export const REFUND_TIMELINE = "Approved refunds reach your original payment method within 7 to 10 business days.";

export const LEGAL_PAGES = {
  terms: {
    path: "/terms",
    title: "Terms of Service",
    pageTitle: "Terms of Service — PAXO",
    updated: "Last updated: 7 November 2026",
    description: "The terms that apply to every booking made on mypaxo.in, the PAXO group booking platform for venues in Delhi NCR.",
    blocks: [
      { t: "p", text: "These terms apply to every booking made on mypaxo.in." },
      { t: "h", text: "Role of PAXO" },
      { t: "p", text: "PAXO is an online booking platform that connects customers with independent partner restaurants, bars and venues. PAXO does not own or operate any venue and does not prepare, sell, serve or deliver food or drinks. All food, drinks and services are provided by the venue, which is solely responsible for them, including holding every licence required by law (such as FSSAI and the excise licences needed to serve alcohol) and following the laws of its state. PAXO does not sell alcohol online. Customers pay a booking deposit through PAXO to confirm a booking, and the balance is paid directly to the venue. Alcohol is served by the venue only to guests who are legally permitted to consume it, and guests confirm their eligibility." },
      {
        t: "ol",
        items: [
          ["About PAXO.", "PAXO is an online platform where customers discover venues in Delhi NCR (restaurants, cafes, bars, lounges and clubs) and book group packages. PAXO is operated by M/S PAXO, a proprietorship of Sushil Kumar."],
          ["Who provides the service.", "The venue provides the food, drinks, entertainment, seating and all services at the event. PAXO is a booking and payment platform and does not run, own or control any venue."],
          ["Booking process.", "You send a booking request for a package and date. The venue accepts or declines. You pay the booking amount only after the venue accepts. Your booking is confirmed when the payment succeeds."],
          ["Prices and taxes.", "Package prices are per person and are set by the venue. The package page says whether taxes are included. The venue issues the final bill for the event."],
          ["Payments.", "The booking amount is paid online through our payment partner. The balance is paid directly to the venue at the event. PAXO does not collect, hold or guarantee the balance."],
          ["Cancellations and refunds.", "They follow our Cancellation and Refund Policy, which forms part of these terms."],
          ["Check-in.", "On the event day you show the check-in code from your booking page to the venue staff."],
          ["Group size.", "Packages have a minimum number of guests, shown on the package page. Extra guests and add-ons are charged by the venue at the event."],
          ["Alcohol.", "Alcohol is served by the venue under its licence, only to guests who meet the legal drinking age of the venue's state. The venue may refuse service to any guest."],
          ["Your conduct.", "You and your guests must follow the venue's rules. The venue may refuse entry or ask any guest to leave. You are responsible for any damage caused by your group."],
          ["Party Pool.", "Themed parties listed under Parties on PAXO have their own terms, shown on each party page. They apply together with these terms."],
          ["Our responsibility.", "PAXO is not responsible for the quality of food, drinks or service, or for any injury, loss or dispute that happens at a venue. Our responsibility is limited to the booking amount you paid through PAXO."],
          ["Changes.", "We may update these terms. The terms shown when you make a booking apply to that booking."],
          ["Governing law.", "Indian law applies. The courts at Gurugram, Haryana have jurisdiction."],
          ["Contact.", "Questions about these terms: support@mypaxo.in, WhatsApp +91 96252 61665. Address: G-53, Ground Floor, Tower A, Ansal Corporate Plaza, Carterpuri Road, Palam Vihar, Gurugram, Haryana 122017."],
        ],
      },
    ],
  },

  privacy: {
    path: "/privacy",
    title: "Privacy Policy",
    pageTitle: "Privacy Policy — PAXO",
    description: "What personal information PAXO collects, why, who it is shared with, and your choices.",
    blocks: [
      { t: "p", text: "This policy explains what personal information PAXO collects, why, and your choices." },
      {
        t: "ol",
        items: [
          ["What we collect.", "Your name, phone number and email address; your sign-in details (including Google sign-in); your booking details (venue, package, date, number of guests); and the guest names or gender details you enter for a Party Pool seat. Payments are handled by our payment partner, so we do not store your card or bank details."],
          ["How we use it.", "To create your account, send your booking request to the venue, process payments and refunds, send booking updates and receipts, provide support, prevent fraud, and improve the app."],
          ["Who we share it with.", "The venue you book receives the details needed to serve you (name, phone number, booking details). Our payment partner receives payment details. Service providers that host our app, send emails or messages, or provide analytics receive only what they need. We do not sell your personal information."],
          ["Marketing.", "We send offers only if you agree. You can opt out at any time."],
          ["How long we keep it.", "For as long as your account is active and as long as the law requires for payment and tax records."],
          ["Security.", "We use access controls and encrypted connections. No online system is completely secure, so we cannot promise absolute security."],
          ["Your choices.", "You can ask us to see, correct or delete your information, or to close your account, by writing to support@mypaxo.in. Some records must be kept for legal reasons."],
          ["Cookies.", "We use cookies and similar tools to keep you signed in and to understand how the app is used. You can limit them in your browser settings."],
          ["Children.", "PAXO is for adults. We do not knowingly collect information from children."],
          ["Changes.", "We may update this policy and will show the new date at the top of this page."],
          ["Contact.", "Privacy questions: support@mypaxo.in, WhatsApp +91 96252 61665. Grievance Officer: Sushil Kumar, Proprietor, support@mypaxo.in, WhatsApp +91 96252 61665. We reply within 7 working days."],
        ],
      },
    ],
  },

  refund: {
    path: "/refund",
    title: "Cancellation and Refund Policy",
    pageTitle: "Cancellation and Refund Policy — PAXO",
    description: "How PAXO bookings are cancelled and refunded: standard and late bookings, the refund schedule and other rules.",
    blocks: [
      { t: "p", text: "The time left before the event decides your booking amount and what is refundable. You see which case applies before you pay." },
      {
        t: "table",
        head: ["", "Standard booking", "Late booking"],
        rows: [
          ["When", "More than 72 hours before the event", "72 hours or less before the event"],
          ["Booking amount", "20% of the package total", "50% of the package total"],
          ["Refundable", "Yes, see the schedule below", "No"],
          ["Balance", "Paid to the venue at the event", "Paid to the venue at the event"],
        ],
      },
      { t: "h", text: "When you cancel a standard booking:" },
      {
        t: "ul",
        items: [
          "More than 72 hours before the event: 100% of the booking amount is refunded.",
          "48 to 72 hours before the event: 50% is refunded.",
          "Less than 48 hours before the event, or a no-show: no refund.",
        ],
      },
      { t: "h", text: "Other rules:" },
      {
        t: "ol",
        items: [
          [null, "A late booking's booking amount is not refundable. You confirm this by ticking a box before paying."],
          [null, "If the venue declines your request or does not respond in time, nothing is charged."],
          [null, "If the venue cancels or cannot honour a confirmed booking, you receive 100% of the booking amount, even on a late booking."],
          [null, "When you cancel, the payment gateway fee is deducted from your refund. In every other case PAXO bears it."],
          [null, REFUND_TIMELINE],
          [null, "You cannot cancel after you have checked in at the venue."],
          [null, "The balance is paid directly to the venue at the event, and the venue issues the final bill. PAXO does not collect the balance."],
          [null, "Party Pool parties have their own rules, shown on each party page. Their deposits are not refundable once paid, unless PAXO or the venue cancels the party or the minimum number of guests is not reached. Then you receive a 100% refund within 7 to 10 working days."],
        ],
      },
      { t: "p", text: "To cancel or ask about a refund, write to support@mypaxo.in or message +91 96252 61665 on WhatsApp." },
    ],
  },

  contact: {
    path: "/contact",
    title: "Contact Us",
    pageTitle: "Contact Us — PAXO",
    description: "Contact PAXO for help with bookings, refunds and venue questions: WhatsApp, email, address and hours.",
    blocks: [
      { t: "p", text: "We are happy to help with bookings, refunds and venue questions." },
      {
        t: "contact",
        items: [
          { label: "WhatsApp (official):", value: "+91 96252 61665", href: "https://wa.me/919625261665" },
          { label: "Email:", value: "support@mypaxo.in", href: "mailto:support@mypaxo.in" },
          { label: "Website:", value: "www.mypaxo.in", href: "https://www.mypaxo.in" },
          { label: "Address:", value: "G-53, Ground Floor, Tower A, Ansal Corporate Plaza, Carterpuri Road, Palam Vihar, Gurugram, Haryana 122017" },
          { label: "Hours:", value: "Monday to Saturday, 10 AM to 7 PM IST" },
        ],
      },
      { t: "p", text: "Venue owners who want to list their venue can write to the same email address." },
    ],
  },
};

export const LEGAL_LINKS = [
  ["terms", "Terms"],
  ["privacy", "Privacy"],
  ["refund", "Refund Policy"],
  ["contact", "Contact"],
];
