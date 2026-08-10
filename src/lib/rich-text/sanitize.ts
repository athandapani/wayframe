// Sanitizes the small rich-text vocabulary the So-what (BLUF) editor can
// produce (wayframe#38 item 4 / #39) — `bluf.statement`/`bullets` became
// markup-bearing HTML with that decision, and every path that puts them on
// the page uses `dangerouslySetInnerHTML`, so unsanitized markup is a real
// XSS vector: a hand-crafted `.wayframe.json` file (document-file.ts's open
// path is fully untrusted input) could carry `<img src=x onerror=...>` in
// what looks like a plain "so what" statement.
//
// Hand-rolled allow-list rather than a new dependency (matches this repo's
// existing bias — PapaParse over SheetJS in wayframe#16 specifically over a
// CVE/dependency-risk concern) — the vocabulary is small and fixed (the
// eight tokens the rich-text toolbar can produce), so a full sanitizer
// library is more surface than the problem needs.

const ALLOWED_TAGS = new Set(["strong", "em", "u", "s", "code", "a", "span", "br"]);
const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(["href", "rel"]),
  span: new Set(["style"]),
};
/** Matches the hex (with optional alpha, e.g. the highlight tool's `#dc262655`) and CSS named-color forms the toolbar actually emits — nothing else is a color a `style` attribute here should be allowed to carry. */
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/;
const SAFE_HREF = /^(https?:|mailto:)/i;

function sanitizeElement(el: Element) {
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap rather than delete — losing the formatting is fine, losing the
    // text underneath it (e.g. a stripped <img> would just vanish, but a
    // stripped <div> wrapping real bullet text shouldn't take the text
    // with it) isn't.
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
    return;
  }

  const allowed = ALLOWED_ATTRS[tag];
  for (const attr of Array.from(el.attributes)) {
    if (!allowed || !allowed.has(attr.name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (attr.name === "href" && !SAFE_HREF.test(attr.value)) {
      el.removeAttribute("href");
    }
    if (attr.name === "style") {
      const kept: string[] = [];
      for (const decl of attr.value.split(";")) {
        const [propRaw, valRaw] = decl.split(":");
        const prop = propRaw?.trim().toLowerCase();
        const val = valRaw?.trim();
        if (!prop || !val || !SAFE_COLOR.test(val)) continue;
        if (prop === "color" || prop === "background-color") kept.push(`${prop}:${val}`);
      }
      if (kept.length > 0) el.setAttribute("style", kept.join(";"));
      else el.removeAttribute("style");
    }
  }
  if (tag === "a") el.setAttribute("rel", "noopener noreferrer");

  for (const child of Array.from(el.children)) sanitizeElement(child);
}

/** Strips anything outside the rich-text toolbar's own vocabulary. Safe to call on trusted and untrusted HTML alike — a no-op on already-clean markup. */
export function sanitizeBlufHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    // No DOM available (e.g. a non-browser test environment) — fail closed
    // to plain text rather than risk unsanitized markup reaching a client
    // that does have one.
    return html.replace(/<[^>]*>/g, "");
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const child of Array.from(doc.body.children)) sanitizeElement(child);
  return doc.body.innerHTML;
}

/** Plain-text projection for contexts that can't render markup (e.g. ExecutiveView's subtext) — strips tags rather than escaping them, so a formatted statement still reads cleanly instead of showing literal angle brackets. */
export function blufHtmlToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return doc.body.textContent ?? "";
}
