// test/contact-check.test.mjs
//
// Will mail to this address arrive, does this site exist, is this a phone
// number. Against a fake resolver: no real DNS.
//
//   node test/contact-check.test.mjs

import assert from "node:assert/strict";
import { emailProblem, domainProblem, phoneProblem } from "../src/guards/contact-check.js";

const err = (code) => Object.assign(new Error(code), { code });
// A tiny DNS: what exists, what takes mail, what is down.
const zone = {
  "brackwater.eu": { mx: ["mx.brackwater.eu"], a: ["192.0.2.1"] },
  "www.brackwater.eu": { a: ["192.0.2.1"] },
  "apex-only.eu": { a: ["192.0.2.2"] },              // no MX, mail goes to the A record
  "www.only-www.eu": { a: ["192.0.2.3"] },            // the site lives on www only
  "nullmx.eu": { mx: [""], a: ["192.0.2.4"] },         // RFC 7505: takes no mail
};
const dns = {
  async resolveMx(h) {
    if (h === "slow.eu") throw err("ETIMEOUT");
    if (h === "broken.eu") throw err("ESERVFAIL");
    const z = zone[h];
    if (!z) throw err("ENOTFOUND");
    if (!z.mx) throw err("ENODATA");
    return z.mx.map((exchange) => ({ exchange, priority: 10 }));
  },
  async resolve4(h) {
    if (h === "slow.eu" || h === "www.slow.eu") throw err("ETIMEOUT");
    const z = zone[h];
    if (!z || !z.a) throw err("ENOTFOUND");
    return z.a;
  },
};

async function run(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}

await run("a normal address passes", async () => {
  assert.equal(await emailProblem("ana@brackwater.eu", { dns }), null);
  assert.equal(await emailProblem("ana@apex-only.eu", { dns }), null, "no MX but an address: mail still arrives");
});

await run("reserved example domains are refused", async () => {
  for (const e of ["ana@example.org", "ana@example.com", "a@kiln.example", "x@host.test", "x@foo.invalid", "x@localhost"]) {
    assert.match(await emailProblem(e, { dns }), /reserved/, e);
  }
});

await run("common provider typos get a hint, not a silent fix", async () => {
  assert.match(await emailProblem("ana@gmial.com", { dns }), /typo of gmail\.com/);
  assert.match(await emailProblem("ana@hotmail.con", { dns }), /typo of hotmail\.com/);
  assert.match(await emailProblem("ana@outlok.com", { dns }), /typo of outlook\.com/);
});

await run("a domain that does not exist, or takes no mail, is refused", async () => {
  assert.match(await emailProblem("ana@nowhere-at-all.eu", { dns }), /does not exist/);
  assert.match(await emailProblem("ana@nullmx.eu", { dns }), /accepts no email/);
});

await run("when DNS cannot answer, the lead goes through", async () => {
  assert.equal(await emailProblem("ana@slow.eu", { dns }), null, "a timeout is not a verdict");
  assert.equal(await emailProblem("ana@broken.eu", { dns }), null, "a resolver error is not a verdict");
});

await run("test runs are relaxed: they send nothing and use example.org on purpose", async () => {
  assert.equal(await emailProblem("ana@example.org", { dns, relaxed: true }), null);
  assert.equal(await domainProblem("example.org", { dns, relaxed: true }), null);
});

await run("a scan domain must exist, with or without www", async () => {
  assert.equal(await domainProblem("brackwater.eu", { dns }), null);
  assert.equal(await domainProblem("https://www.brackwater.eu/about", { dns }), null);
  assert.equal(await domainProblem("only-www.eu", { dns }), null, "found under www");
  assert.match(await domainProblem("nowhere-at-all.eu", { dns }), /could not be found/);
  assert.match(await domainProblem("example.com", { dns }), /reserved/);
  assert.equal(await domainProblem("slow.eu", { dns }), null, "could not ask: let it through");
});

await run("phone numbers: real ones pass, placeholders and wrong lengths do not", async () => {
  for (const p of ["+31 6 12345678", "+370 612 34567", "06-24681357", "+49 30 901820", "0031 20 555 0199"]) {
    assert.equal(phoneProblem(p), null, p);
  }
  assert.match(phoneProblem("12345"), /too short/);
  assert.match(phoneProblem("+31 6 1234 5678 9012 3456"), /too long/);
  assert.match(phoneProblem("0000000000"), /placeholder/);
  assert.match(phoneProblem("1234567"), /placeholder/);
  assert.match(phoneProblem("+31 123456789"), /placeholder/);
  assert.equal(phoneProblem(""), null, "no phone is not a bad phone");
});
