// src/guards/numbers.js
//
// A phone number the agent did not read on the site never reaches the visitor.
// The prompt can forbid inventing one, and a model will still do it now and
// then: Agent Fritz invented a plausible mobile number in production on
// 1 Oct 2026. A rule that must hold is enforced here, not requested.
//
// The answer streams in small chunks, so a number can arrive in pieces. The
// guard holds back whatever could still be the start of a number until it is
// complete, checks it against every digit on the site, and lets it through or
// replaces it.

// Something that looks like a phone number: starts with + or 0, 8 to 15 digits.
const PHONE = /(?:\+|\b0)\d[\d\s().\/-]{6,22}\d/g;
// The tail of a chunk that may be the start of a number still arriving.
const OPEN_TAIL = /(?:\+|\b0)[\d\s().\/-]*$/;

const digitsOf = (s) => String(s).replace(/\D/g, "");

// "(the site lists no such number)" in the language the agent answers in.
export const WITHHELD = {
  en: "(no such number on this site)", nl: "(dat nummer staat niet op deze site)", de: "(diese Nummer steht nicht auf dieser Website)",
  fr: "(ce numéro ne figure pas sur ce site)", es: "(ese número no figura en este sitio)", it: "(questo numero non è su questo sito)",
  pt: "(esse número não está neste site)", lt: "(tokio numerio šioje svetainėje nėra)",
};

// All digits on the site, in one string, for "does this number appear anywhere".
export function siteDigits(knowledge) {
  return digitsOf((knowledge.pages || []).map((p) => p.text).join("\n"));
}

export class NumberGuard {
  constructor(corpusDigits, lang = "en") {
    this.corpus = corpusDigits || "";
    this.note = WITHHELD[lang] || WITHHELD.en;
    this.held = "";
    this.withheld = 0;
  }

  check(text) {
    return text.replace(PHONE, (m) => {
      const d = digitsOf(m);
      if (d.length < 8 || d.length > 15) return m;
      // Written with or without the country code, with or without the leading 0.
      const variants = [d, d.replace(/^00/, ""), d.replace(/^0/, "")];
      if (variants.some((v) => v.length >= 7 && this.corpus.includes(v))) return m;
      this.withheld += 1;
      return this.note;
    });
  }

  push(chunk) {
    const text = this.held + (chunk || "");
    const open = OPEN_TAIL.exec(text);
    // Hold back a possible number in progress; let everything before it go.
    const cut = open && open[0].length <= 32 ? open.index : text.length;
    this.held = text.slice(cut);
    return this.check(text.slice(0, cut));
  }

  flush() {
    const out = this.check(this.held);
    this.held = "";
    return out;
  }
}
