// A quote reaches the visitor only if it is literally on the page.
import assert from "node:assert/strict";
import { verifyQuote } from "../src/guards/verify-quote.js";

const pages = [{ path: "pricing.md", text: "# Pricing\n\nTidewatch costs EUR 49 per sensor per month, billed   yearly." }];
assert.ok(verifyQuote(pages, "pricing.md", "Tidewatch costs EUR 49 per sensor per month, billed yearly."), "whitespace is forgiven");
assert.equal(verifyQuote(pages, "pricing.md", "Tidewatch costs EUR 39 per sensor per month."), null, "a changed number is not");
assert.equal(verifyQuote(pages, "contact.md", "Tidewatch costs EUR 49 per sensor per month."), null, "the wrong page is not");
assert.equal(verifyQuote(pages, "pricing.md", "EUR 49"), null, "a fragment is not proof");
console.log("ok   quotes are verified: 4 checks");
