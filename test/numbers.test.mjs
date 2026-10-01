// test/numbers.test.mjs
//
// No phone number reaches the visitor unless the site (or the visitor) has it.
//
//   node test/numbers.test.mjs

import assert from "node:assert/strict";
import { NumberGuard, siteDigits, WITHHELD } from "../src/guards/numbers.js";

const SITE = siteDigits({ pages: [{ text: "Company number 00000000. Call +31 10 555 0142 during office hours. Tidewatch costs EUR 49 a month." }] });

async function run(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
// Feed text in small chunks, the way the model streams it.
function stream(guard, text, size = 3) {
  let out = "";
  for (let i = 0; i < text.length; i += size) out += guard.push(text.slice(i, i + size));
  return out + guard.flush();
}

await run("an invented number never reaches the visitor, however it is chunked", async () => {
  for (const size of [1, 2, 3, 5, 8, 50]) {
    const g = new NumberGuard(SITE, "en");
    const out = stream(g, "You can call +31 6 2847 1935 or email hello@brackwater.example.", size);
    assert.doesNotMatch(out, /2847/, `chunk size ${size}`);
    assert.match(out, /no such number on this site/);
    assert.match(out, /hello@brackwater\.example\.$/);
    assert.equal(g.withheld, 1);
  }
});

await run("a number that is on the site goes through, in any spelling", async () => {
  for (const n of ["+31 10 555 0142", "+31105550142", "0031 10 555 0142", "010 555 0142"]) {
    const g = new NumberGuard(SITE);
    assert.equal(stream(g, `Call ${n} today.`), `Call ${n} today.`, n);
  }
});

await run("the visitor's own number can be read back", async () => {
  const g = new NumberGuard(`${SITE}|31612345678`);
  assert.equal(stream(g, "John Test, +31 6 12345678. Correct?"), "John Test, +31 6 12345678. Correct?");
});

await run("dates, times, prices and the company number are left alone", async () => {
  const text = "Company number 00000000. Monday 5 October 2026, 09:00 (10:00 in Helsinki). Tidewatch costs EUR 49 / month. 2026-10-05.";
  const g = new NumberGuard(SITE);
  assert.equal(stream(g, text, 4), text);
  assert.equal(g.withheld, 0);
});

await run("in the visitor's language", async () => {
  const g = new NumberGuard(SITE, "nl");
  assert.match(stream(g, "Bel 06 12121212."), new RegExp(WITHHELD.nl.replace(/[()]/g, "\\$&")));
});
