// The demo agent with a scripted model: the guards hold whatever it decides.
import assert from "node:assert/strict";
import { answer } from "../src/agent/agent.mjs";
import { setResolver } from "../src/guards/contact-check.js";

setResolver({ resolveMx: async () => [{ exchange: "mx", priority: 10 }], resolve4: async () => ["192.0.2.1"] });
const pages = [
  { path: "pricing.md", text: "# Pricing\nTidewatch costs EUR 49 per sensor per month, billed yearly." },
  { path: "contact.md", text: "# Contact\nEmail: hello@brackwater.example. There is no phone line." },
];
let script = [];
globalThis.fetch = async () => ({ ok: true, json: async () => script.shift() });
const text = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const tool = (name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + Math.random(), name, input }] });

// Proof that is not on the page is dropped; proof that is, is kept.
script = [tool("read_page", { path: "pricing.md" }), text("It costs EUR 49 per sensor per month.\nSOURCE: pricing.md | Tidewatch costs EUR 49 per sensor per month, billed yearly.")];
let r = await answer(pages, [{ role: "user", content: "What does it cost?" }]);
assert.equal(r.source.page, "pricing.md");
assert.equal(r.text, "It costs EUR 49 per sensor per month.");
script = [text("It costs EUR 39.\nSOURCE: pricing.md | Tidewatch costs EUR 39 per sensor per month, billed yearly.")];
r = await answer(pages, [{ role: "user", content: "What does it cost?" }]);
assert.equal(r.source, null, "an invented quote never reaches the visitor");

// An invented phone number is withheld.
script = [text("Call us on +31 6 2847 1935.")];
r = await answer(pages, [{ role: "user", content: "Phone?" }]);
assert.doesNotMatch(r.text, /2847/);

// The model tries to send on details typed this very message: refused, nothing sent.
let delivered = 0;
script = [tool("request_contact", { name: "Ana", email: "ana@harbourmail.eu", topic: "Call me" }), text("To confirm: Ana, ana@harbourmail.eu. Shall I pass this on?")];
r = await answer(pages, [{ role: "user", content: "Contact me: Ana, ana@harbourmail.eu" }], { deliver: async () => { delivered++; } });
assert.equal(r.sent, false);
assert.equal(delivered, 0);

// After the read-back and a yes, it goes.
script = [tool("request_contact", { name: "Ana", email: "ana@harbourmail.eu", topic: "Call me" }), text("Passed on.")];
r = await answer(pages, [
  { role: "user", content: "Contact me: Ana, ana@harbourmail.eu" },
  { role: "assistant", content: "To confirm: Ana, ana@harbourmail.eu. Shall I pass this on?" },
  { role: "user", content: "Yes" },
], { deliver: async () => { delivered++; } });
assert.equal(r.sent, true);
assert.equal(delivered, 1);

// An address the visitor never typed: refused.
script = [tool("request_contact", { email: "made@up.example", topic: "x" }), text("Which address?")];
r = await answer(pages, [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "just pick one" }]);
assert.equal(r.sent, false);
console.log("ok   demo agent: the guards hold whatever the model decides (9 checks)");
