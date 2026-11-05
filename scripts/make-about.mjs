// After `vite build`: write dist/<page>/index.html = the app shell with page-specific title / description and the page text
// already in the HTML, so /about, /terms, /privacy, /refund and /contact work for crawlers (and without JavaScript) and when
// opened or refreshed directly.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ABOUT_TITLE, ABOUT_PAGE_TITLE, ABOUT_DESCRIPTION, ABOUT_LEAD, ABOUT_PARAGRAPHS } from "../src/aboutCopy.js";
import { LEGAL_PAGES, LEGAL_UPDATED, LEGAL_LINKS } from "../src/legalCopy.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shell = readFileSync("dist/index.html", "utf8");

const link = "color:#f5a524";
const P = "line-height:1.6;color:#c9bdb4";
function legalBody(p) {
  return p.blocks
    .map((b) => {
      if (b.t === "p") return `<p style="${P}">${esc(b.text)}</p>`;
      if (b.t === "h") return `<p style="font-weight:600">${esc(b.text)}</p>`;
      if (b.t === "ul") return `<ul style="${P}">${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      if (b.t === "ol") return `<ol style="${P}">${b.items.map(([h, t]) => `<li style="margin-bottom:8px">${h ? `<strong>${esc(h)}</strong> ` : ""}${esc(t)}</li>`).join("")}</ol>`;
      if (b.t === "table")
        return `<table style="${P};border-collapse:collapse;width:100%"><thead><tr>${b.head.map((h) => `<th style="text-align:left;padding:6px;border-bottom:1px solid #444">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border-bottom:1px solid #333;vertical-align:top">${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`;
      if (b.t === "contact")
        return `<ul style="${P}">${b.items.map((x) => `<li style="margin-bottom:8px"><strong>${esc(x.label)}</strong> ${x.href ? `<a href="${esc(x.href)}" style="${link}">${esc(x.value)}</a>` : esc(x.value)}</li>`).join("")}</ul>`;
      return "";
    })
    .join("");
}
const footerLinks =
  `<p style="margin-top:32px;font-size:13px">` +
  [["/about", "About"], ...LEGAL_LINKS.map(([k, l]) => [LEGAL_PAGES[k].path, l])].map(([h, l]) => `<a href="${h}" style="${link};margin-right:14px">${esc(l)}</a>`).join("") +
  `</p>`;

function write(path, title, desc, inner) {
  let html = shell;
  const must = (re, rep) => {
    if (!re.test(html)) throw new Error("make-about: pattern not found " + re);
    html = html.replace(re, () => rep);
  };
  const url = `https://www.mypaxo.in${path}`;
  must(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  must(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(desc)}" />`);
  must(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  must(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  must(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`);
  must(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(desc)}" />`);
  must(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  must(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(desc)}" />`);
  const body =
    `<div style="min-height:100vh;background:#0b0708;color:#f5efe9;font-family:Inter,system-ui,sans-serif;padding:32px 20px">` +
    `<div style="max-width:680px;margin:0 auto"><p style="font-weight:700;font-size:24px;margin:0 0 24px"><a href="/" style="color:inherit;text-decoration:none">PAXO</a></p>` +
    inner +
    `<p><a href="/" style="${link}">Back to PAXO</a></p>${footerLinks}</div></div>`;
  must(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
  const dir = `dist${path}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, html);
  console.log(`wrote ${dir}/index.html`);
}

write(
  "/about",
  ABOUT_PAGE_TITLE,
  ABOUT_DESCRIPTION,
  `<h1 style="font-size:32px;margin:0 0 12px">${esc(ABOUT_TITLE)}</h1><p style="font-size:20px;font-weight:600">${esc(ABOUT_LEAD)}</p>` +
    ABOUT_PARAGRAPHS.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")
);
for (const p of Object.values(LEGAL_PAGES)) {
  write(
    p.path,
    p.pageTitle,
    p.description,
    `<h1 style="font-size:32px;margin:0 0 4px">${esc(p.title)}</h1><p style="font-size:12px;color:#9a8e86;margin:0 0 20px">${esc(LEGAL_UPDATED)}</p>` + legalBody(p)
  );
}
