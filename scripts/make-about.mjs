// After `vite build`: write dist/about/index.html = the app shell with About-specific title / description and the page text
// already in the HTML, so /about works for crawlers (and without JavaScript) and when opened or refreshed directly.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ABOUT_TITLE, ABOUT_PAGE_TITLE, ABOUT_DESCRIPTION, ABOUT_LEAD, ABOUT_PARAGRAPHS } from "../src/aboutCopy.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let html = readFileSync("dist/index.html", "utf8");
const must = (re, rep) => {
  if (!re.test(html)) throw new Error("make-about: pattern not found " + re);
  html = html.replace(re, rep);
};
must(/<title>[\s\S]*?<\/title>/, `<title>${esc(ABOUT_PAGE_TITLE)}</title>`);
must(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(ABOUT_DESCRIPTION)}" />`);
must(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="https://www.mypaxo.in/about" />`);
must(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="https://www.mypaxo.in/about" />`);
must(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(ABOUT_PAGE_TITLE)}" />`);
must(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(ABOUT_DESCRIPTION)}" />`);
must(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(ABOUT_PAGE_TITLE)}" />`);
must(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(ABOUT_DESCRIPTION)}" />`);
const body =
  `<div style="min-height:100vh;background:#0b0708;color:#f5efe9;font-family:Inter,system-ui,sans-serif;padding:32px 20px">` +
  `<div style="max-width:640px;margin:0 auto"><p style="font-weight:700;font-size:24px;margin:0 0 24px"><a href="/" style="color:inherit;text-decoration:none">PAXO</a></p>` +
  `<h1 style="font-size:32px;margin:0 0 12px">${esc(ABOUT_TITLE)}</h1><p style="font-size:20px;font-weight:600">${esc(ABOUT_LEAD)}</p>` +
  ABOUT_PARAGRAPHS.map((p) => `<p style="line-height:1.6;color:#c9bdb4">${esc(p)}</p>`).join("") +
  `<p><a href="/" style="color:#f5a524">Back to PAXO</a></p></div></div>`;
must(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
mkdirSync("dist/about", { recursive: true });
writeFileSync("dist/about/index.html", html);
console.log("wrote dist/about/index.html");
