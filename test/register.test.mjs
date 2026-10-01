// test/register.test.mjs
//
// Dutch visitors get "u": informal sentences are rewritten before they are
// sent, and a bad rewrite falls back to a blunt swap, never to "je".
//
//   node test/register.test.mjs

import assert from "node:assert/strict";
import { RegisterGuard, isInformal, swapToFormal, setRewriter, toFormal } from "../src/guards/register-nl.js";

async function run(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}

await run("spots the informal words, not words that contain them", async () => {
  assert.ok(isInformal("Als je kaart is gestolen."));
  assert.ok(isInformal("Jij kunt dat zelf nakijken."));
  assert.ok(isInformal("Dat is jouw keuze."));
  assert.ok(!isInformal("U kunt de jeugdige jenever bij Jeroen bestellen."), "je inside other words is not je");
  assert.ok(!isInformal("Wilt u een gratis scan proberen?"));
});

await run("the fallback swap is blunt but never informal", async () => {
  assert.equal(swapToFormal("Heb je een vraag? Dan kun je mailen."), "Heeft u een vraag? Dan kunt u mailen.");
  assert.equal(swapToFormal("Dat is jouw keuze, en jij beslist."), "Dat is uw keuze, en u beslist.");
  assert.equal(swapToFormal("Je kunt het nakijken."), "U kunt het nakijken.");
});

await run("a good rewrite is used; one that changes a number is not", async () => {
  setRewriter(async () => "Als uw kaart is gestolen, belt u het noodnummer.");
  assert.equal(await toFormal("Als je kaart is gestolen, bel je het noodnummer. "), "Als uw kaart is gestolen, belt u het noodnummer. ");
  setRewriter(async () => "Bel u 0800-1234 voor hulp.");
  assert.equal(await toFormal("Bel je 0800-9999 voor hulp."), "Belt u 0800-9999 voor hulp.", "digits changed: fallback swap");
  setRewriter(async () => { throw new Error("down"); });
  assert.equal(await toFormal("Wil je dat?"), "Wilt u dat?", "rewrite down: fallback swap");
  setRewriter(null);
});

await run("streams sentence by sentence, in order, only fixing what needs it", async () => {
  setRewriter(async (s) => s.replace(/je kunt/, "u kunt").replace(/Je kunt/, "U kunt"));
  const out = [];
  const g = new RegisterGuard((t) => out.push(t));
  for (const chunk of ["Tidewatch kost €49 per maa", "nd. Je kunt het", " zelf proberen.", " Wilt u een demo?"]) g.push(chunk);
  await g.drain();
  assert.equal(out.join(""), "Tidewatch kost €49 per maand. U kunt het zelf proberen. Wilt u een demo?");
  assert.equal(g.fixed, 1);
  setRewriter(null);
});
