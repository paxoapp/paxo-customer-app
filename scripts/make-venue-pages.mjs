// Before `vite build`: read live venues + packages from Supabase (public anon key, same rows customers can see) and write
// plain static HTML pages so crawlers (Google, ChatGPT search) can read venues and packages without running JavaScript:
//   public/venues/<slug>/index.html   one page per venue
//   public/venues/index.html          all venues by city
//   public/sitemap.xml, public/robots.txt
// Vite copies public/ into dist/ as-is. If Supabase can't be reached, the last generated files are kept and the build goes on.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { LANDING_LINKS } from "../src/seoLinks.js";

const SITE = "https://www.mypaxo.in";
const WHATSAPP_NUMBER = "919625261665";
const WHATSAPP_LABEL = "+91 96252 61665";

// Same project + public anon key the app itself uses (read from src/App.jsx so there's one copy).
const appSrc = readFileSync("src/App.jsx", "utf8");
const SUPABASE_URL = appSrc.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const ANON_KEY = appSrc.match(/const ANON_KEY =\s*"([^"]+)"/)?.[1];

// Test venue that must never be published.
const EXCLUDED = [{ name: "illusion", area: "sector 18" }];

const FOOD_KINDS = ["starter_veg", "starter_non_veg", "main_veg", "main_non_veg", "side", "dessert"];
const LIQUOR_KINDS = ["single_malt", "whisky", "vodka", "gin", "rum", "spirits", "beer", "wine"];
const LABELS = {
  starter_veg: ["Veg Starter", "Veg Starters"],
  starter_non_veg: ["Non-Veg Starter", "Non-Veg Starters"],
  main_veg: ["Veg Main Course", "Veg Main Courses"],
  main_non_veg: ["Non-Veg Main Course", "Non-Veg Main Courses"],
  dessert: ["Dessert", "Desserts"],
  side: ["Side", "Sides"],
  single_malt: ["Single Malt", "Single Malts"],
  whisky: ["Whisky", "Whiskies"],
  vodka: ["Vodka", "Vodkas"],
  gin: ["Gin", "Gins"],
  rum: ["Rum", "Rums"],
  spirits: ["Spirits", "Spirits"],
  beer: ["Beer", "Beers"],
  wine: ["Wine", "Wines"],
  classic_cocktails: ["Classic Cocktail", "Classic Cocktails"],
  mocktails: ["Mocktail", "Mocktails"],
  soft_beverages: ["Soft Beverage", "Soft Beverages"],
};
const label = (kind, n) => (LABELS[kind] ? LABELS[kind][n === 1 ? 0 : 1] : kind);
const CITY_ORDER = ["Delhi", "Gurugram", "Noida"];
const CITY_REGION = { Delhi: "Delhi", "New Delhi": "Delhi", Gurugram: "Haryana", Gurgaon: "Haryana", Noida: "Uttar Pradesh" };

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const effectivePrice = (p) => {
  const price = Number(p.price_per_head || 0);
  const pct = Number(p.discount_percent || 0);
  return pct > 0 ? Math.round(price * (1 - pct / 100) * 100) / 100 : price;
};
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const hours = (h) => (h ? `${Number(h)} hour${Number(h) === 1 ? "" : "s"}` : null);
const gstText = (p) =>
  p.gst_mode === "included"
    ? "GST included in the price"
    : p.gst_mode === "excluded"
      ? "GST extra (added at checkout)"
      : p.gst_mode === "non_gst"
        ? "No GST applies"
        : "Taxes as applicable";

async function fetchVenues() {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Supabase URL / anon key not found in src/App.jsx");
  const select =
    "id,name,description,venue_type,city,area,address,latitude,longitude,google_maps_url,guest_capacity,serves_alcohol,venue_view_code,updated_at," +
    "venue_images(image_url,sort_order)," +
    "venue_packages(id,name,description,price_per_head,discount_percent,min_headcount,duration_hours,includes_alcohol,includes_dj,dj_notes,gst_mode,inclusions,is_published,admin_hold," +
    "menu_quota_rules(category_kind,quota_count),package_item_pool(menu_items(name,is_available,menu_categories(kind))))";
  const qs = [
    `select=${select}`,
    "status=eq.approved",
    "venue_state=eq.active",
    "is_live=eq.true",
    "venue_packages.is_published=eq.true",
    "venue_packages.admin_hold=eq.false",
    "venue_images.order=sort_order.asc",
    "order=name.asc",
  ].join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/venues?${qs}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.filter(
    (v) =>
      !EXCLUDED.some((x) => v.name?.trim().toLowerCase() === x.name && (v.area || "").trim().toLowerCase() === x.area) &&
      (v.venue_packages || []).length > 0
  );
}

// Group a package's brand pool by category kind: { whisky: ["Black Dog", ...], starter_veg: [...] }
function poolByKind(p) {
  const out = {};
  for (const r of p.package_item_pool || []) {
    const it = r.menu_items;
    const kind = it?.menu_categories?.kind;
    if (!it || !kind || it.is_available === false) continue;
    (out[kind] ||= new Set()).add(it.name.trim());
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort((a, b) => a.localeCompare(b))]));
}

const CSS = `
:root{--bg:#0b0708;--card:#16100f;--line:#2a201d;--text:#f5efe9;--muted:#c9bdb4;--gold:#f5a524;--gold2:#ffcf70}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55}
a{color:var(--gold)}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px 56px}
.brand{font-family:"Space Grotesk",Inter,sans-serif;font-weight:700;font-size:22px;letter-spacing:.04em;color:var(--text);text-decoration:none}
header.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:24px}
header.top nav a{margin-left:14px;font-size:14px;text-decoration:none}
h1,h2,h3{font-family:"Space Grotesk",Inter,sans-serif;line-height:1.2}
h1{font-size:32px;margin:0 0 6px}
h2{font-size:22px;margin:36px 0 12px;color:var(--gold2)}
h3{font-size:19px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 4px}
.muted{color:var(--muted)}
.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:20px 0}
.photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.btn{display:inline-block;padding:11px 18px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
.btn.gold{background:var(--gold);color:#1a0f00}
.btn.ghost{border:1px solid var(--gold);color:var(--gold)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:14px 0}
.price{font-size:22px;font-weight:700;color:var(--gold2)}
.price s{font-size:15px;color:var(--muted);font-weight:500;margin-left:6px}
.off{font-size:13px;color:#4ade80;margin-left:6px;font-weight:600}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:12px 0;font-size:14px}
dl.facts dt{color:var(--muted)}
dl.facts dd{margin:0}
.k{font-weight:600;margin:12px 0 2px;font-size:14px}
ul.list{margin:4px 0;padding-left:20px;color:var(--muted);font-size:14px}
.venues{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.venues a.row{display:flex;justify-content:space-between;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-decoration:none;color:var(--text)}
.venues .from{color:var(--gold2);font-weight:600;white-space:nowrap}
ul.chips{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:8px}
ul.chips a{display:inline-block;padding:7px 13px;border:1px solid var(--line);border-radius:999px;background:var(--card);text-decoration:none;font-size:14px}
.lead{font-size:18px;color:var(--gold2);font-weight:700;margin:14px 0}
.intro p{color:var(--muted)}
.tbl{overflow-x:auto;margin:12px 0;border:1px solid var(--line);border-radius:14px}
table.pk{border-collapse:collapse;width:100%;font-size:14px;min-width:760px}
table.pk th,table.pk td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
table.pk th{background:var(--card);color:var(--muted);font-weight:600;white-space:nowrap}
table.pk td.pr{white-space:nowrap;color:var(--gold2);font-weight:600}
table.pk td.pr s{color:var(--muted);font-weight:400;font-size:12px;display:block}
.faq h3{font-size:16px;margin:18px 0 4px}
.faq p{margin:0;color:var(--muted)}
footer .pop a{margin-right:10px}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
footer a{margin-right:14px}
@media (max-width:520px){h1{font-size:26px}dl.facts{grid-template-columns:1fr}dl.facts dt{margin-top:6px}}
`.trim();

const head = ({ title, desc, path, image, jsonld }) => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${SITE}${path}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="PAXO" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(image || `${SITE}/og-image.png`)}" />
<meta property="og:locale" content="en_IN" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(image || `${SITE}/og-image.png`)}" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
${[].concat(jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="/">PAXO</a><nav><a href="/venues/">All venues</a><a href="/">Open app</a></nav></header>
`;

const footer = `<footer>
<p>PAXO lets groups book unlimited food &amp; drinks party packages at restaurants, bars and clubs in Delhi NCR.</p>
<p class="pop"><strong>Popular searches:</strong> ${LANDING_LINKS.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</p>
<p><a href="/">PAXO app</a><a href="/venues/">All venues</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refunds</a><a href="/contact">Contact</a></p>
</footer>
</div>
</body>
</html>
`;

const waLink = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
const mapsLink = (v) =>
  v.google_maps_url ||
  (v.latitude != null && v.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.name, v.address, v.area, v.city].filter(Boolean).join(", "))}`);
// og:image must be a format every link-preview crawler reads (WhatsApp/Facebook skip webp/avif).
const ogImage = (v) =>
  (v.venue_images || [])
    .map((i) => i.image_url)
    .find((u) => /\.(jpe?g|png)$/i.test(String(u || "").split("?")[0])) || `${SITE}/og-image.png`;
const venueTypeSchema =(v) => (/bar|pub|lounge|club|brew/i.test(`${v.venue_type} ${v.name}`) ? "BarOrPub" : "Restaurant");

function packageHtml(v, p) {
  const eff = effectivePrice(p);
  const pct = Number(p.discount_percent || 0);
  const pool = poolByKind(p);
  const quota = Object.fromEntries((p.menu_quota_rules || []).map((r) => [r.category_kind, Number(r.quota_count)]));
  const liquor = LIQUOR_KINDS.filter((k) => pool[k]?.length);
  const foodQuota = FOOD_KINDS.filter((k) => quota[k] > 0);
  const foodPool = FOOD_KINDS.filter((k) => pool[k]?.length);
  const otherQuota = Object.keys(quota).filter((k) => !FOOD_KINDS.includes(k) && !LIQUOR_KINDS.includes(k) && quota[k] > 0);
  const dj = p.includes_dj ? `Yes${p.dj_notes ? ` (${esc(p.dj_notes)})` : ""}` : "No";

  let h = `<article class="card" id="pkg-${esc(slugify(p.name))}">
<h3>${esc(p.name)}</h3>
<p class="price">${inr(eff)} <span class="muted" style="font-size:14px;font-weight:500">per person</span>${pct > 0 ? `<s>${inr(p.price_per_head)}</s><span class="off">${esc(pct)}% off</span>` : ""}</p>
${p.description ? `<p class="muted">${esc(p.description)}</p>` : ""}
<dl class="facts">
<dt>Alcohol included</dt><dd>${p.includes_alcohol ? "Yes, unlimited drinks" : "No (food &amp; soft drinks package)"}</dd>
<dt>Duration</dt><dd>${esc(hours(p.duration_hours) || "As per venue")}</dd>
<dt>Minimum guests</dt><dd>${p.min_headcount ? esc(p.min_headcount) : "No minimum"}</dd>
<dt>DJ</dt><dd>${dj}</dd>
<dt>GST</dt><dd>${esc(gstText(p))}</dd>
</dl>`;
  if (liquor.length) {
    h += `<p class="k">Liquor brands</p><ul class="list">${liquor
      .map((k) => `<li><strong>${esc(label(k, pool[k].length))}:</strong> ${esc(pool[k].join(", "))}${quota[k] ? ` (choose ${quota[k]})` : ""}</li>`)
      .join("")}</ul>`;
  }
  if (foodQuota.length || foodPool.length) {
    h += `<p class="k">Food inclusions</p><ul class="list">`;
    for (const k of FOOD_KINDS) {
      if (!quota[k] && !pool[k]?.length) continue;
      const head = quota[k] ? `${quota[k]} ${label(k, quota[k])}` : label(k, 2);
      h += `<li><strong>${esc(head)}</strong>${pool[k]?.length ? ` from: ${esc(pool[k].join(", "))}` : ""}</li>`;
    }
    h += `</ul>`;
  }
  if (otherQuota.length) {
    h += `<p class="k">Also included</p><ul class="list">${otherQuota.map((k) => `<li>${esc(`${quota[k]} ${label(k, quota[k])}`)}</li>`).join("")}</ul>`;
  }
  const inclusions = (p.inclusions || []).filter((s) => typeof s === "string" && s.trim());
  if (inclusions.length) {
    h += `<p class="k">What's included</p><ul class="list">${inclusions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
  }
  h += `<div class="cta"><a class="btn gold" href="${esc(waLink(`Hi PAXO, I'd like to book the ${p.name} package at ${v.name}, ${v.area}, ${v.city}.`))}">Book ${esc(p.name)} on WhatsApp</a></div>
</article>`;
  return h;
}

function venuePage(v, slug) {
  const path = `/venues/${slug}/`;
  const pkgs = [...v.venue_packages].sort((a, b) => effectivePrice(a) - effectivePrice(b));
  const from = effectivePrice(pkgs[0]);
  const photos = (v.venue_images || []).map((i) => i.image_url).filter(Boolean).slice(0, 3);
  const place = [v.area, v.city].filter(Boolean).join(", ");
  const title = `${v.name}, ${place} | Unlimited Food & Drinks Packages | PAXO`;
  const hasAlcohol = pkgs.some((p) => p.includes_alcohol);
  const desc = `${v.name} in ${place}: ${pkgs.length} unlimited ${hasAlcohol ? "food & drinks" : "food"} party package${pkgs.length === 1 ? "" : "s"} from ${inr(from)} per person. See menus, liquor brands and prices, and book on PAXO or WhatsApp ${WHATSAPP_LABEL}.`;
  const appLink = v.venue_view_code ? `${SITE}/v/${v.venue_view_code}` : `${SITE}/`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": venueTypeSchema(v),
    "@id": `${SITE}${path}#venue`,
    name: v.name,
    url: `${SITE}${path}`,
    description: v.description || desc,
    image: photos,
    servesCuisine: "Indian",
    priceRange: `₹${Math.round(from)}+ per person`,
    hasMap: mapsLink(v),
    ...(v.guest_capacity ? { maximumAttendeeCapacity: v.guest_capacity } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: v.address || undefined,
      addressLocality: v.area ? `${v.area}, ${v.city}` : v.city,
      addressRegion: CITY_REGION[v.city] || undefined,
      addressCountry: "IN",
    },
    ...(v.latitude != null && v.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: Number(v.latitude), longitude: Number(v.longitude) } }
      : {}),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${v.name} party packages`,
      itemListElement: pkgs.map((p) => ({
        "@type": "Offer",
        name: `${p.name} package`,
        description: [
          p.includes_alcohol ? "Unlimited food & drinks" : "Unlimited food",
          hours(p.duration_hours),
          p.min_headcount ? `min ${p.min_headcount} guests` : null,
          p.includes_dj ? "DJ included" : null,
          gstText(p),
        ]
          .filter(Boolean)
          .join(", "),
        price: effectivePrice(p).toFixed(2),
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        url: `${SITE}${path}#pkg-${slugify(p.name)}`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: effectivePrice(p).toFixed(2),
          priceCurrency: "INR",
          referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "person" },
          valueAddedTaxIncluded: p.gst_mode === "included",
        },
        ...(p.min_headcount ? { eligibleQuantity: { "@type": "QuantitativeValue", minValue: p.min_headcount, unitText: "guests" } } : {}),
      })),
    },
  };

  let body = head({ title, desc, path, image: ogImage(v), jsonld });
  body += `<main>
<h1>${esc(v.name)}</h1>
<p class="sub">${esc([v.venue_type, place].filter(Boolean).join(" · "))}</p>
${v.address ? `<p class="sub">${esc(v.address)}</p>` : ""}
<p><a href="${esc(mapsLink(v))}" rel="noopener">View on Google Maps</a></p>
${photos.length ? `<div class="photos">${photos.map((src, i) => `<img src="${esc(src)}" alt="${esc(`${v.name}, ${place}, photo ${i + 1}`)}" loading="${i ? "lazy" : "eager"}" width="400" height="300" />`).join("")}</div>` : ""}
<p>${pkgs.length} unlimited party package${pkgs.length === 1 ? "" : "s"} from <strong>${inr(from)} per person</strong>${v.guest_capacity ? `, for groups of up to ${esc(v.guest_capacity)} guests` : ""}.</p>
${v.description ? `<p class="muted">${esc(v.description)}</p>` : ""}
<div class="cta">
<a class="btn gold" href="${esc(waLink(`Hi PAXO, I'd like to book a party package at ${v.name}, ${place}.`))}">Book on WhatsApp ${WHATSAPP_LABEL}</a>
<a class="btn ghost" href="${esc(appLink)}">Book in the PAXO app</a>
</div>
<h2>Packages at ${esc(v.name)}</h2>
${pkgs.map((p) => packageHtml(v, p)).join("\n")}
<h2>How to book</h2>
<p class="muted">Message PAXO on WhatsApp at <a href="${esc(waLink(`Hi PAXO, I'd like to book at ${v.name}, ${place}.`))}">${WHATSAPP_LABEL}</a> with your date, time, number of guests and package, or book directly in the <a href="${esc(appLink)}">PAXO app</a>. Prices are per person; menus and brands are as listed by the venue and may change with availability.</p>
<p><a href="/venues/">See all PAXO venues in Delhi, Gurugram and Noida</a></p>
</main>
`;
  return body + footer;
}

function indexPage(entries) {
  const path = "/venues/";
  const title = "Party Venues in Delhi, Gurugram & Noida | Unlimited Food & Drinks Packages | PAXO";
  const desc =
    "All PAXO party venues in Delhi NCR: restaurants, bars and lounges in Delhi, Gurugram and Noida with unlimited food & drinks packages per person. Compare prices and book on WhatsApp.";
  const cities = [...new Set([...CITY_ORDER, ...entries.map((e) => e.v.city)])].filter((c) => entries.some((e) => e.v.city === c));
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "PAXO party venues",
    itemListElement: entries.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/venues/${e.slug}/`, name: e.v.name })),
  };
  let body = head({ title, desc, path, jsonld });
  body += `<main>
<h1>Party venues in Delhi NCR</h1>
<p class="sub">Unlimited food &amp; drinks packages, priced per person, at ${entries.length} venues across ${cities.join(", ")}.</p>
<div class="cta"><a class="btn gold" href="${esc(waLink("Hi PAXO, I'd like help booking a party venue."))}">Book on WhatsApp ${WHATSAPP_LABEL}</a><a class="btn ghost" href="/">Open the PAXO app</a></div>
<h2>Popular searches</h2>
<ul class="chips">${LANDING_LINKS.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join("")}</ul>
`;
  for (const c of cities) {
    const list = entries.filter((e) => e.v.city === c).sort((a, b) => a.from - b.from);
    body += `<h2>${esc(c)}</h2>\n<ul class="venues">${list
      .map(
        (e) =>
          `<li><a class="row" href="/venues/${e.slug}/"><span><strong>${esc(e.v.name)}</strong><br /><span class="muted" style="font-size:14px">${esc([e.v.venue_type, e.v.area].filter(Boolean).join(" · "))} · ${e.v.venue_packages.length} package${e.v.venue_packages.length === 1 ? "" : "s"}</span></span><span class="from">from ${inr(e.from)}/person</span></a></li>`
      )
      .join("\n")}</ul>\n`;
  }
  body += `</main>\n`;
  return body + footer;
}

function sitemap(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    [`${SITE}/`, "weekly", "1.0", today],
    [`${SITE}/venues/`, "daily", "0.9", today],
    ...LANDING_LINKS.map(([h]) => [`${SITE}${h}`, "daily", "0.9", today]),
    ...entries.map((e) => [`${SITE}/venues/${e.slug}/`, "weekly", "0.8", (e.v.updated_at || "").slice(0, 10) || today]),
    [`${SITE}/about`, "monthly", "0.5"],
    [`${SITE}/terms`, "yearly", "0.3"],
    [`${SITE}/privacy`, "yearly", "0.3"],
    [`${SITE}/refund`, "yearly", "0.3"],
    [`${SITE}/contact`, "yearly", "0.3"],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ([loc, cf, pr, lm]) => `  <url>
    <loc>${loc}</loc>${lm ? `\n    <lastmod>${lm}</lastmod>` : ""}
    <changefreq>${cf}</changefreq>
    <priority>${pr}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

// ---------------------------------------------------------------------------------------------------------------
// SEO landing pages: one per search phrase, each listing the live packages that match it.

// Brands we recognise in a package's free-text inclusions (many packages list liquor there instead of a brand pool).
// Order = how "headline" a brand is; used to pick the top brands shown in the tables.
const BRANDS = [
  ["Glenfiddich", /glenfiddich/i], ["Glenlivet", /glenlivet/i], ["Chivas Regal", /chivas/i], ["Monkey Shoulder", /monkey shoulder/i],
  ["Indri", /\bindri\b/i], ["Grey Goose", /grey goose/i], ["Belvedere", /belvedere/i], ["Ciroc", /ciroc/i], ["Hendrick's", /hendrick/i],
  ["Roku Gin", /\broku\b/i], ["Toki", /\btoki\b/i], ["JW Gold Label", /gold label/i], ["JW Double Black", /double black/i],
  ["JW Black Label", /black label/i], ["Jameson", /jameson/i], ["Jack Daniel's", /jack daniel|\bjd no/i], ["Tanqueray", /tanqueray/i],
  ["Bombay Sapphire", /bombay sapphire/i], ["Absolut", /absolut/i], ["Dewar's", /dewar/i], ["Black Dog", /black dog/i],
  ["Teacher's", /teacher/i], ["Smirnoff", /smirnoff/i], ["Bacardi", /bacardi/i], ["Old Monk", /old monk/i], ["Beefeater", /beefeater/i],
  ["Jacob's Creek", /jacob'?s creek/i], ["Corona", /corona/i], ["Hoegaarden", /hoegaarden/i], ["Budweiser", /budweiser/i],
  ["Kingfisher", /kingfisher/i], ["Carlsberg", /carlsberg/i], ["Tuborg", /tuborg/i], ["Royal Ranthambore", /ranthambore/i],
];
// Single malts / imported premium spirits that put a package on the premium-liquor page.
const PREMIUM_RE =
  /glenfiddich|glenlivet|chivas|grey goose|monkey shoulder|\bindri\b|single malt|belvedere|ciroc|hendrick|\broku\b|\btoki\b|gold label|double black|liquor \(imported\)/i;

const pkgText = (p) =>
  [...(p.package_item_pool || []).map((r) => r.menu_items?.name || ""), ...(p.inclusions || []), p.name, p.description || ""].join(" | ");
const isPremium = (p) =>
  p.includes_alcohol &&
  (PREMIUM_RE.test(pkgText(p)) || (p.package_item_pool || []).some((r) => r.menu_items?.menu_categories?.kind === "single_malt"));
function topBrands(p, n = 4) {
  if (!p.includes_alcohol) return [];
  const text = pkgText(p);
  return BRANDS.filter(([, re]) => re.test(text)).map(([b]) => b).slice(0, n);
}

const joinList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Shared FAQ facts — the only claims the FAQ makes.
const FAQ = {
  duration: (topic) => [`How long does ${topic} last, and is GST included?`, "Each package runs for 3 hours. The price is per person and GST is included."],
  minGuests: (topic) => [`What is the minimum group size for ${topic}?`, "The minimum is 10 to 20 guests, depending on the venue. Each venue's minimum is shown in the table on this page."],
  dj: () => ["Is a DJ included?", "Yes, a DJ is included at most venues."],
  book: () => ["How do I book?", `Book on PAXO's official WhatsApp at ${WHATSAPP_LABEL}. You get an official receipt for your booking.`],
  deposit: () => ["How much do I pay to confirm the booking?", "A 20% deposit confirms bookings of up to 100 guests. The balance is paid at the venue."],
  brands: (q = "Which liquor brands are served?") => [q, "Liquor brands are as per availability at the venue."],
};

const LANDINGS = [
  {
    path: "/unlimited-food-and-drinks-packages-delhi/",
    h1: "Party Places in Delhi with Unlimited Food & Drinks",
    title: "Party Places in Delhi with Unlimited Food & Drinks Packages – Prices per Person | PAXO",
    desc: (c) => `Party places in Delhi with unlimited food & drinks, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person. Book on WhatsApp.`,
    match: (v) => v.city === "Delhi",
    topic: "an unlimited food and drinks package in Delhi",
    wa: "unlimited food & drinks packages in Delhi",
    faq: (t) => [FAQ.duration(t), FAQ.minGuests("a party package in Delhi"), FAQ.dj(), FAQ.book(), FAQ.deposit(), FAQ.brands()],
    intro: (c) => [
      `Planning a party in Delhi and want one clear price per person instead of a long bill at the end of the night? An unlimited food and drinks package does exactly that. You pick a venue and a package, tell us how many guests are coming, and everyone eats and drinks from the package menu for the whole session. Nobody has to split individual orders, and there is no surprise tab when the music stops.`,
      `Below are the live PAXO packages in Delhi: ${c.pkgText} at ${c.venuesText} in ${c.areas}. Each row shows the per-person price after any current offer, whether alcohol is included, the headline liquor brands and the minimum group size, so you can compare restaurants, bars and lounges side by side. The prices come straight from each venue's current listing on PAXO.`,
      `Food-only options work well for family gatherings and groups who prefer not to drink, while the liquor packages step up from Indian-made spirits to imported brands and single malts. Open any venue to see its photos, the full menu and every package it offers, then book on WhatsApp in a couple of minutes.`,
    ],
  },
  {
    path: "/unlimited-food-and-drinks-packages-gurugram/",
    h1: "Party Places in Gurgaon (Gurugram) with Unlimited Food & Drinks",
    title: "Party Places in Gurgaon (Gurugram) with Unlimited Food & Drinks Packages – Prices per Person | PAXO",
    desc: (c) => `Party places in Gurgaon (Gurugram) with unlimited food & drinks, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person.`,
    match: (v) => v.city === "Gurugram" || v.city === "Gurgaon",
    topic: "an unlimited food and drinks package in Gurugram",
    wa: "unlimited food & drinks packages in Gurugram",
    faq: (t) => [FAQ.duration(t), FAQ.minGuests("a party package in Gurugram"), FAQ.dj(), FAQ.deposit(), FAQ.book(), FAQ.brands("Can I choose the liquor brands?")],
    intro: (c) => [
      `Gurugram has no shortage of places to party, but comparing group deals usually means calling each place, waiting for a quote and then doing the maths per head yourself. This page skips that step. It lists the live PAXO party packages in Gurgaon (Gurugram) with the price per person already worked out.`,
      `PAXO currently lists ${c.pkgText} at ${c.venuesText} in ${c.areas}. The options range from food-only spreads to packages with full liquor, so a small birthday dinner and a big team night can both find a fit. For every package you can see the price after any running offer, whether alcohol is included, the main brands poured and the minimum number of guests the venue needs.`,
      `Because every package is a fixed-time session where your group orders freely from the package menu, the host knows the total before the party starts. That makes budgeting easy when you are collecting money from friends or getting a spend approved at work. Open a venue page for photos and the complete menu, or message PAXO on WhatsApp and we will help you choose a package and lock in your date.`,
    ],
  },
  {
    path: "/unlimited-food-and-drinks-packages-noida/",
    h1: "Party Places in Noida with Unlimited Food & Drinks",
    title: "Party Places in Noida with Unlimited Food & Drinks Packages – Prices per Person | PAXO",
    desc: (c) => `Party places in Noida with unlimited food & drinks, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person. Book on WhatsApp.`,
    match: (v) => v.city === "Noida",
    topic: "an unlimited food and drinks package in Noida",
    wa: "unlimited food & drinks packages in Noida",
    faq: (t) => [FAQ.duration(t), FAQ.minGuests("a party package in Noida"), FAQ.book(), FAQ.deposit(), FAQ.dj(), FAQ.brands()],
    intro: (c) => [
      `Hosting a get-together in Noida? Ordering dish by dish for a big group gets slow and expensive, and someone always ends up settling an awkward bill. A package flips that around: every guest gets unlimited food, and drinks if you choose an alcohol package, for a set session at one per-person rate that you know before you arrive.`,
      `Here you will find ${c.pkgText} at ${c.venuesText} in ${c.areas}, all live on PAXO right now. The table compares each package's price per person, whether it includes alcohol, the leading liquor brands and the smallest group the venue accepts. If a venue is running an offer, the discounted price is the one shown.`,
      `Noida packages are a good fit for college reunions, society celebrations, farewells and weekend parties with friends from across the city. There are food-only choices for mixed groups, and liquor tiers that move from popular Indian-made spirits up to imported whisky, vodka and gin. Tap a venue to see photos and the full menu, then send us a WhatsApp with your date and guest count to book.`,
    ],
  },
  {
    path: "/unlimited-drinks-packages-delhi-ncr/",
    h1: "Unlimited Drinks Packages in Delhi NCR",
    title: "Unlimited Drinks Packages in Delhi NCR – Unlimited Alcohol Party Packages | PAXO",
    desc: (c) => `Unlimited alcohol party packages in Delhi NCR, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person, sorted by price.`,
    matchPkg: (p) => p.includes_alcohol,
    topic: "an unlimited drinks package",
    wa: "unlimited drinks packages in Delhi NCR",
    faq: (t) => [FAQ.brands("Which liquor brands are included in an unlimited drinks package?"), FAQ.duration(t), FAQ.minGuests("an unlimited drinks package"), FAQ.deposit(), FAQ.book(), FAQ.dj()],
    intro: (c) => [
      `If drinks are the heart of your party, an unlimited drinks package is the simplest way to keep everyone's glass full without running up a bar tab. Each package below includes alcohol along with food, priced per person for the whole session, so the cost does not change no matter who orders the next round.`,
      `This list covers every alcohol package live on PAXO across ${c.cities}: ${c.pkgText} at ${c.venuesText}, sorted from the lowest price per person upwards. The cheapest currently starts at ${c.from}. As you go down the table, packages move from beer and Indian-made whisky, vodka and rum to imported labels and single malts, and the "Top liquor brands" column shows what each tier is built around.`,
      `Comparing on price alone can be misleading, so check the minimum group size too, since some venues need more guests than others. When you have found the right balance of budget and brands, open the venue page for the complete drinks list and food menu, or message PAXO on WhatsApp with your date and headcount and we will confirm the details for you.`,
    ],
  },
  {
    path: "/premium-liquor-packages-delhi-ncr/",
    h1: "Premium Liquor Packages in Delhi NCR",
    title: "Premium Liquor Party Packages in Delhi NCR | Single Malts & Imported Spirits | PAXO",
    desc: (c) => `Premium liquor packages with single malts & imported spirits, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} in Delhi NCR from ${c.from} per person.`,
    matchPkg: isPremium,
    topic: "a premium liquor package",
    wa: "premium liquor packages in Delhi NCR",
    faq: (t) => [FAQ.brands("Are the single malt and imported brands guaranteed?"), FAQ.duration(t), FAQ.minGuests("a premium liquor package"), FAQ.dj(), FAQ.deposit(), FAQ.book()],
    intro: (c) => [
      `Some celebrations call for more than the house pour. Premium liquor packages bring single malts and imported spirits to the table, with brands such as Glenfiddich, Glenlivet, Chivas Regal, Grey Goose, Monkey Shoulder and Indri, poured for your group throughout the session at a fixed price per person.`,
      `PAXO has ${c.pkgText} at this level right now, at ${c.venuesText} across ${c.cities}, starting from ${c.from} per person. We include a package here when its listed brands feature single malt whisky or imported premium spirits; packages built only around Indian-made spirits and beer are left out. The table shows the headline brands for each package so you can quickly spot the labels your guests will care about.`,
      `Premium packages suit milestone birthdays, anniversaries, client evenings and celebrations where the drinks are part of the experience. Because the price is per person and fixed for the session, you can offer top-shelf drinks without worrying about how the bill will look at the end. Open any venue for the full brand list and menu, or message PAXO on WhatsApp and we will help you compare the options.`,
    ],
  },
  {
    path: "/non-alcoholic-party-packages-delhi-ncr/",
    h1: "Non-Alcoholic Party Packages in Delhi NCR",
    title: "Non-Alcoholic Party Packages in Delhi NCR | Food & Mocktails per Person | PAXO",
    desc: (c) => `Non-alcoholic party packages (food, mocktails & soft drinks) with prices & photos: ${c.pkgText} at ${c.venuesText} in Delhi NCR from ${c.from} per person.`,
    matchPkg: (p) => !p.includes_alcohol,
    topic: "a non-alcoholic party package",
    wa: "non-alcoholic party packages in Delhi NCR",
    faq: (t) => [FAQ.duration(t), FAQ.minGuests("a non-alcoholic package"), FAQ.dj(), FAQ.deposit(), FAQ.book()],
    intro: (c) => [
      `Not every great party needs alcohol. Family functions, kids' and teen birthdays, religious celebrations, office lunches and groups with lots of non-drinkers all work better with a package built around food, mocktails and soft drinks. That is exactly what this page lists.`,
      `There are ${c.pkgText} live on PAXO right now at ${c.venuesText} across ${c.cities}, starting from ${c.from} per person. None of them include alcohol; each one is built around unlimited food from the venue's package menu, with mocktails or soft drinks as the venue lists them. The table shows the price after any running offer and the minimum group size, so you can shortlist quickly.`,
      `A food-and-mocktails package is also the most budget-friendly way to host a large group, and it keeps the evening relaxed for guests of every age. Many of these venues are lively bars and lounges, so you still get the music and the atmosphere of a night out. Open a venue to see the full food menu, starters and desserts, or message PAXO on WhatsApp with your date and guest count and we will set it up.`,
    ],
  },
  {
    path: "/birthday-party-packages-delhi-ncr/",
    h1: "Birthday Party Places in Delhi NCR",
    title: "Birthday Party Places in Delhi NCR – Packages with Prices | PAXO",
    desc: (c) => `Birthday party places in Delhi NCR with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person. DJ at most venues. Book on WhatsApp.`,
    matchPkg: () => true,
    topic: "a birthday party package",
    wa: "a birthday party package",
    faq: (t) => [FAQ.duration(t), FAQ.dj(), FAQ.minGuests("a birthday party package"), FAQ.deposit(), FAQ.book(), FAQ.brands()],
    intro: (c) => [
      `Birthdays are more fun when the host gets to enjoy them too. With a birthday party package you choose the venue and the menu once, invite your friends, and the venue takes care of unlimited food and drinks for the whole session. No chasing the bill, no counting who ordered what, just one price per person that everyone knows in advance.`,
      `PAXO has ${c.pkgText} that work for birthdays, at ${c.venuesText} across ${c.cities}. Prices start from ${c.from} per person, and the list runs from food-only packages for family celebrations to full liquor packages for a proper night out. Every row shows the price, whether alcohol is included, the main brands and the minimum number of guests, sorted from the most affordable upwards.`,
      `Pick the vibe first: a buzzing bar for a 21st or 30th, a lounge for a dressier celebration, or a restaurant for a family dinner with cake afterwards. Then match the package to your guest list and budget. Open any venue for photos and the complete menu, or message PAXO on WhatsApp with the date, the birthday person's name and your headcount, and we will help you book.`,
    ],
  },
  {
    path: "/office-party-packages-delhi-ncr/",
    h1: "Corporate Party Venues in Delhi NCR",
    title: "Corporate Party Venues in Delhi NCR – Office Party Packages with Prices | PAXO",
    desc: (c) => `Corporate party venues for office parties & team outings in Delhi NCR, with prices, photos & liquor brands: ${c.pkgText} at ${c.venuesText} from ${c.from} per person.`,
    matchPkg: () => true,
    sortByCity: true,
    topic: "an office party package",
    wa: "an office party / team outing",
    faq: (t) => [FAQ.book(), FAQ.duration(t), FAQ.deposit(), FAQ.minGuests("an office party package"), FAQ.dj(), FAQ.brands()],
    intro: (c) => [
      `Organising a team outing, quarter-end celebration or farewell? The hardest part is usually not finding a venue but getting a clear, fixed cost that finance will sign off. Office party packages solve that: a per-person price for unlimited food, and drinks if you want them, for a set session, with GST included in the price.`,
      `This page lists ${c.pkgText} at ${c.venuesText} across ${c.cities}, grouped by city so you can pick somewhere close to the office, starting from ${c.from} per person. Food-only packages are a safe choice for mixed teams and daytime events, while alcohol packages suit evening celebrations. Each row shows the price after any running offer, whether alcohol is included, the key brands and the minimum group size.`,
      `Booking through PAXO keeps the paperwork simple: you deal with one contact on WhatsApp and you get an official receipt for your booking, which makes reimbursement and approvals easier. Share this page with your team to shortlist a venue, open the venue pages for the full menus, then message us with your date and headcount and we will take it from there.`,
    ],
  },
];

function landingPage(def, entries) {
  const rows = [];
  for (const e of entries) {
    if (def.match && !def.match(e.v)) continue;
    for (const p of e.v.venue_packages) {
      if (def.matchPkg && !def.matchPkg(p)) continue;
      rows.push({ e, p, price: effectivePrice(p) });
    }
  }
  const cityRank = (c) => (CITY_ORDER.indexOf(c) + 1 || 99);
  rows.sort((a, b) => (def.sortByCity ? cityRank(a.e.v.city) - cityRank(b.e.v.city) : 0) || a.price - b.price || a.e.v.name.localeCompare(b.e.v.name));

  const vset = [...new Map(rows.map((r) => [r.e.slug, r.e.v])).values()];
  const ctx = {
    from: rows.length ? inr(Math.min(...rows.map((r) => r.price))) : "",
    venuesText: plural(vset.length, "venue", "venues"),
    pkgText: plural(rows.length, "package", "packages"),
    areas: joinList([...new Set(vset.map((v) => v.area).filter(Boolean))]),
    cities: joinList(CITY_ORDER.filter((c) => vset.some((v) => v.city === c))),
  };
  const { path } = def;
  const title = def.title;
  const desc = def.desc(ctx);
  const faq = def.faq(def.topic);
  const waText = `Hi PAXO, I'd like to book ${def.wa}. Date: , Guests: `;
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: def.h1, item: `${SITE}${path}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  let body = head({ title, desc, path, jsonld });
  body += `<main>
<nav class="muted" style="font-size:13px;margin-bottom:10px"><a href="/">Home</a> › ${esc(def.h1)}</nav>
<h1>${esc(def.h1)}</h1>
${rows.length ? `<p class="lead">Starting from ${ctx.from} per person</p>` : ""}
<div class="intro">${def.intro(ctx).map((t) => `<p>${esc(t)}</p>`).join("\n")}</div>
<div class="cta"><a class="btn gold" href="${esc(waLink(waText))}">Book on WhatsApp ${WHATSAPP_LABEL}</a><a class="btn ghost" href="/venues/">See all venues</a></div>
<h2>Packages${rows.length ? ` (${rows.length})` : ""}</h2>
`;
  if (!rows.length) {
    body += `<p class="muted">No packages match right now. See <a href="/venues/">all venues</a> or message us on WhatsApp.</p>`;
  } else {
    body += `<div class="tbl"><table class="pk">
<thead><tr><th>Venue</th><th>Area</th><th>Package</th><th>Price / person</th><th>Alcohol</th><th>Top liquor brands</th><th>Min guests</th></tr></thead>
<tbody>
${rows
  .map(({ e, p, price }) => {
    const pct = Number(p.discount_percent || 0);
    const href = `/venues/${e.slug}/#pkg-${slugify(p.name)}`;
    return `<tr><td><a href="/venues/${e.slug}/">${esc(e.v.name)}</a></td><td>${esc([e.v.area, e.v.city].filter(Boolean).join(", "))}</td><td><a href="${href}">${esc(p.name)}</a></td><td class="pr">${inr(price)}${pct > 0 ? `<s>${inr(p.price_per_head)} (${esc(pct)}% off)</s>` : ""}</td><td>${p.includes_alcohol ? "Yes" : "No"}</td><td>${p.includes_alcohol ? esc(topBrands(p).join(", ") || "As per venue") : "—"}</td><td>${p.min_headcount ? esc(p.min_headcount) : "—"}</td></tr>`;
  })
  .join("\n")}
</tbody></table></div>`;
  }
  body += `
<h2>How to book</h2>
<p class="muted">Message PAXO on WhatsApp at <a href="${esc(waLink(waText))}">${WHATSAPP_LABEL}</a> with your date, number of guests and the package you like. A 20% deposit confirms bookings of up to 100 guests, the balance is paid at the venue, and you get an official receipt. You can also open any venue above to see its photos and full menu.</p>
<h2>Frequently asked questions</h2>
<div class="faq">${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n")}</div>
<h2>Related searches</h2>
<ul class="chips">${LANDING_LINKS.filter(([h]) => h !== path).map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join("")}<li><a href="/venues/">All venues</a></li></ul>
</main>
`;
  return body + footer;
}

const ROBOTS = `# Search engines and AI search / assistant crawlers are welcome.
User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

async function main() {
  let venues;
  try {
    venues = await fetchVenues();
  } catch (e) {
    console.warn(`make-venue-pages: could not load venues (${e.message}); keeping the existing public/venues pages.`);
    return;
  }
  if (!venues.length) {
    console.warn("make-venue-pages: no live venues returned; keeping the existing public/venues pages.");
    return;
  }

  const used = new Set();
  const entries = venues.map((v) => {
    let slug = slugify(`${v.name} ${v.city}`);
    if (used.has(slug)) slug = slugify(`${v.name} ${v.area} ${v.city}`);
    while (used.has(slug)) slug += "-2";
    used.add(slug);
    return { v, slug, from: Math.min(...v.venue_packages.map(effectivePrice)) };
  });

  // Rebuild public/venues from scratch so venues that went offline drop out.
  if (existsSync("public/venues")) rmSync("public/venues", { recursive: true, force: true });
  for (const e of entries) {
    mkdirSync(`public/venues/${e.slug}`, { recursive: true });
    writeFileSync(`public/venues/${e.slug}/index.html`, venuePage(e.v, e.slug));
  }
  writeFileSync("public/venues/index.html", indexPage(entries));
  for (const def of LANDINGS) {
    mkdirSync(`public${def.path}`, { recursive: true });
    writeFileSync(`public${def.path}index.html`, landingPage(def, entries));
  }
  console.log(`make-venue-pages: wrote ${LANDINGS.length} landing pages`);
  writeFileSync("public/sitemap.xml", sitemap(entries));
  writeFileSync("public/robots.txt", ROBOTS);
  console.log(`make-venue-pages: wrote ${entries.length} venue pages: ${readdirSync("public/venues").filter((f) => f !== "index.html").join(", ")}`);
}

await main();
