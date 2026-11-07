import React from "react";
import { LEGAL_PAGES, LEGAL_UPDATED, LEGAL_LINKS } from "./legalCopy.js";

// One legal page (terms / privacy / refund / contact), same look as the /about page.
export function LegalPage({ page }) {
  const p = LEGAL_PAGES[page];
  if (!p) return null;
  return (
    <div className="max-w-2xl" data-testid={`legal-${page}`}>
      <h1 className="font-display text-3xl font-bold mb-1">{p.title}</h1>
      <p className="text-xs text-haze/70 mb-6" data-testid="legal-updated">{p.updated ?? LEGAL_UPDATED}</p>
      <div className="flex flex-col gap-4 text-haze leading-relaxed">
        {p.blocks.map((b, i) => {
          if (b.t === "p") return <p key={i}>{b.text}</p>;
          if (b.t === "h") return <p key={i} className="font-semibold text-ink mt-2">{b.text}</p>;
          if (b.t === "ul")
            return (
              <ul key={i} className="list-disc pl-5 flex flex-col gap-1.5">
                {b.items.map((x) => <li key={x}>{x}</li>)}
              </ul>
            );
          if (b.t === "ol")
            return (
              <ol key={i} className="list-decimal pl-5 flex flex-col gap-2.5">
                {b.items.map(([head, text]) => (
                  <li key={text} className="pl-1">
                    {head && <strong className="text-ink">{head}</strong>} {text}
                  </li>
                ))}
              </ol>
            );
          if (b.t === "table")
            return (
              <div key={i} className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-ink">
                      {b.head.map((h, j) => <th key={j} className="px-3 py-2.5 font-semibold align-top">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r) => (
                      <tr key={r[0]} className="border-t border-white/10 align-top">
                        {r.map((c, j) => (j === 0 ? <th key={j} className="px-3 py-2.5 font-medium text-ink">{c}</th> : <td key={j} className="px-3 py-2.5">{c}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          if (b.t === "contact")
            return (
              <ul key={i} className="flex flex-col gap-2.5">
                {b.items.map((x) => (
                  <li key={x.label}>
                    <strong className="text-ink">{x.label}</strong>{" "}
                    {x.href ? <a href={x.href} className="underline hover:text-amber" {...(x.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{x.value}</a> : x.value}
                  </li>
                ))}
              </ul>
            );
          return null;
        })}
      </div>
    </div>
  );
}

// The four footer links. `go` switches screen inside the app; without it they are plain links (full page load).
export function LegalLinks({ go, className = "text-xs text-haze/60 hover:text-amber transition-colors" }) {
  return (
    <>
      {LEGAL_LINKS.map(([key, label]) => (
        <a
          key={key}
          href={LEGAL_PAGES[key].path}
          onClick={go ? (e) => { e.preventDefault(); go(key); } : undefined}
          className={className}
          data-testid={`footer-${key}`}
        >
          {label}
        </a>
      ))}
    </>
  );
}
