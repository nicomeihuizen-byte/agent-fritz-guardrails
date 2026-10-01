// src/guards/register-nl.js
//
// Dutch visitors are addressed with "u", the way the site addresses them.
// The prompt says so and the model still drops into "je" (evals, 1 Oct 2026:
// "als je kaart is gestolen", "waarin je me aanspreekt"). A rule that must
// hold is enforced here, not requested.
//
// It cannot be a word swap: "je kunt" becomes "u kunt", "je kaart" becomes
// "uw kaart", "heb je" becomes "heeft u". So each Dutch sentence is held until
// it is complete. A sentence without je/jij/jou/jouw goes out as it is (almost
// all of them). One with them is rewritten into the u-form by a short model
// call, checked (same digits, about the same length, no informal word left),
// and only then sent. If the rewrite fails the check, a plain word swap goes
// out instead: clumsy beats informal.

const INFORMAL = /(^|[^\p{L}])(je|jij|jou|jouw|jouwe)(?=$|[^\p{L}])/iu;
const SENTENCE_END = /[.!?:](?=\s)|\n/g;

const digits = (s) => String(s).replace(/\D/g, "");

// Verb before "je" (inverted word order) takes the u-form of the verb.
const INVERTED = {
  heb: "heeft", ben: "bent", kun: "kunt", kan: "kunt", wil: "wilt", zal: "zult", mag: "mag", moet: "moet",
  zou: "zou", ga: "gaat", doe: "doet", zie: "ziet", ken: "kent", weet: "weet", vind: "vindt", krijg: "krijgt",
  kom: "komt", lees: "leest", stuur: "stuurt", spreek: "spreekt", bel: "belt", zoek: "zoekt", wilde: "wilde",
};

// The fallback: blunt, never informal.
export function swapToFormal(s) {
  return s
    .replace(/(^|[^\p{L}])(\p{L}+)\s+(je|jij)(?=$|[^\p{L}])/giu, (m, pre, verb, pron) => {
      const v = INVERTED[verb.toLowerCase()];
      if (!v) return m;
      const out = verb[0] === verb[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v;
      return `${pre}${out} u`;
    })
    .replace(/(^|[^\p{L}])(jouwe|jouw)(?=$|[^\p{L}])/giu, (m, pre, w) => `${pre}${w[0] === "J" ? "Uw" : "uw"}`)
    .replace(/(^|[^\p{L}])(jij|jou|je)(?=$|[^\p{L}])/giu, (m, pre, w) => `${pre}${w[0] === "J" ? "U" : "u"}`);
}

export function isInformal(s) {
  return INFORMAL.test(s);
}

// The rewrite: one short, non-streamed model call per offending sentence.
async function modelRewrite(sentence) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.MODEL || "claude-haiku-4-5",
      max_tokens: 300,
      system: "Rewrite the Dutch text so it addresses the reader formally: u and uw instead of je, jij, jou and jouw, with the verb forms that go with u. Change nothing else: same words, same facts, same numbers, same punctuation and line breaks. Output only the rewritten text.",
      messages: [{ role: "user", content: sentence }],
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`rewrite ${r.status}`);
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

let rewriter = modelRewrite;
export function setRewriter(fn) { rewriter = fn || modelRewrite; }

export async function toFormal(sentence) {
  try {
    const out = await rewriter(sentence);
    // Keep the edge whitespace exactly as it was: the stream depends on it.
    const lead = sentence.match(/^\s*/)[0], trail = sentence.match(/\s*$/)[0];
    const core = out.trim();
    const ok = core
      && !isInformal(core)
      && digits(core) === digits(sentence)
      && core.length > sentence.trim().length * 0.7
      && core.length < sentence.trim().length * 1.4;
    if (ok) return lead + core + trail;
  } catch (err) {
    console.error("register: rewrite failed", err.message);
  }
  return swapToFormal(sentence);
}

// Streams Dutch text sentence by sentence through the check above.
export class RegisterGuard {
  constructor(send) {
    this.send = send;
    this.buf = "";
    this.chain = Promise.resolve();
    this.fixed = 0;
  }

  push(text) {
    if (!text) return;
    this.buf += text;
    let cut = -1, m;
    SENTENCE_END.lastIndex = 0;
    while ((m = SENTENCE_END.exec(this.buf))) cut = m.index + m[0].length;
    if (cut < 0) return;
    const done = this.buf.slice(0, cut);
    this.buf = this.buf.slice(cut);
    this.queue(done);
  }

  queue(text) {
    this.chain = this.chain.then(async () => {
      if (!isInformal(text)) return this.send(text);
      this.fixed += 1;
      this.send(await toFormal(text));
    });
  }

  // Everything held goes out; call before anything else is sent.
  async drain() {
    if (this.buf) { const rest = this.buf; this.buf = ""; this.queue(rest); }
    await this.chain;
  }
}
