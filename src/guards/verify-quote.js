// src/guards/verify-quote.js
//
// "Where does it say so?" only works if the quote is real. The model may
// offer a sentence as proof for its answer; it reaches the visitor only if
// it is literally on the page it names. Whitespace, quote marks and case are
// forgiven; words are not.

const normalise = (s) => String(s)
  .toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/\s+/g, " ")
  .trim();

// pages: [{ path, text }]. Returns the quote if verified, else null.
export function verifyQuote(pages, path, quote) {
  const page = pages.find((p) => p.path === path);
  if (!page) return null;
  const q = normalise(quote).replace(/^["']|["']$/g, "");
  const words = q.split(" ").length;
  if (words < 5 || words > 40) return null;
  return normalise(page.text).includes(q) ? quote.trim() : null;
}
