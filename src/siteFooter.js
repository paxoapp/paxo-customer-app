// Footer content shared by the React app (src/App.jsx) and the prebuilt pages (scripts/make-about.mjs, scripts/make-venue-pages.mjs),
// so every footer has the same groups, labels and addresses. Pure data: safe to import from the build scripts.
import { LANDING_LINKS } from "./seoLinks.js";
import { LEGAL_PAGES } from "./legalCopy.js";

// "Find us elsewhere" — understated icon links, not a CTA.
export const SOCIAL_LINKS = [
  {
    label: "X (Twitter)",
    href: "https://x.com/Mypaxo",
    d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61592804842088",
    d: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/paxo.in/",
    d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@mypaxo",
    d: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
];

// Three groups. Explore + Packages are the sitemap landing pages; Company are the policy pages.
// `key` marks the links that open an in-app screen from the React footer (the static pages use plain hrefs).
export const FOOTER_GROUPS = [
  { title: "Explore", links: [{ href: "/venues/", label: "All venues" }, ...LANDING_LINKS.slice(0, 3).map(([href, label]) => ({ href, label }))] },
  { title: "Packages", links: LANDING_LINKS.slice(3).map(([href, label]) => ({ href, label })) },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About", key: "about" },
      { href: LEGAL_PAGES.contact.path, label: "Contact", key: "contact" },
      { href: LEGAL_PAGES.terms.path, label: "Terms", key: "terms" },
      { href: LEGAL_PAGES.privacy.path, label: "Privacy", key: "privacy" },
      { href: LEGAL_PAGES.refund.path, label: "Refund Policy", key: "refund" },
    ],
  },
];

// ---- Static (prebuilt) pages: the same footer as plain HTML + its own scoped CSS, so it looks like the React one. ----
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Same glyph as WhatsAppIcon in src/whatsapp.jsx (that file is JSX, so the path is repeated here).
const WHATSAPP_ICON_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z";
const FOOTER_CSS = `
.sf{margin-top:44px;border-top:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.9);font-family:Inter,system-ui,sans-serif;font-weight:400;font-size:14px;line-height:1.4;color:#C9B8AE;text-align:left}
.sf *{box-sizing:border-box}
.sf-in{max-width:1000px;margin:0 auto;padding:40px 20px 48px}
.sf-blurb{margin:0 0 28px;font-size:13px;color:rgba(201,184,174,.6)}
.sf-grid{display:grid;grid-template-columns:1fr;gap:32px}
.sf-t{margin:0 0 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(201,184,174,.4)}
.sf ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.sf a{color:rgba(201,184,174,.6);text-decoration:none;margin:0;transition:color .15s}
.sf a:hover{color:#F5A623}
.sf-base{margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center}
.sf-left{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px 16px}
.sf-soc{display:flex;align-items:center;gap:16px}
.sf-soc a{color:rgba(201,184,174,.4);display:inline-flex}
.sf-soc svg,.sf-wa svg{width:16px;height:16px;fill:currentColor}
.sf a.sf-wa{display:inline-flex;align-items:center;gap:6px;font-size:12px}
.sf a.sf-wa:hover{color:#25D366}
.sf-c{margin:0;font-size:12px;color:rgba(201,184,174,.4)}
@media (min-width:640px){.sf-grid{grid-template-columns:repeat(3,1fr);gap:40px}.sf-in{padding:40px 32px 48px}.sf-base{flex-direction:row;justify-content:space-between;text-align:left}}
`.trim();

// extraLinks: [{ group: "Company", href, label }] for links that only exist on that kind of page (e.g. "PAXO app").
export function staticFooterHtml({ waHref, blurb = "", year = new Date().getFullYear(), extraLinks = [] } = {}) {
  const groups = FOOTER_GROUPS.map((g) => {
    const links = [...g.links, ...extraLinks.filter((x) => x.group === g.title)];
    return `<nav aria-label="${esc(g.title)}"><p class="sf-t">${esc(g.title)}</p><ul>${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}</ul></nav>`;
  }).join("");
  const social = SOCIAL_LINKS.map((s) => `<a href="${esc(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.d}"/></svg></a>`).join("");
  return `<style>${FOOTER_CSS}</style>
<footer class="sf"><div class="sf-in">${blurb ? `<p class="sf-blurb">${blurb}</p>` : ""}<div class="sf-grid">${groups}</div>
<div class="sf-base"><div class="sf-left"><div class="sf-soc">${social}</div><a class="sf-wa" href="${esc(waHref)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${WHATSAPP_ICON_PATH}"/></svg>Chat with us on WhatsApp</a></div><p class="sf-c">© ${year} PAXO</p></div></div></footer>`;
}
