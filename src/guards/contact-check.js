// src/guards/contact-check.js
//
// Is this a way to reach a real person? The agent already checks that an
// email looks like one and that the visitor typed it themselves. This file
// asks the next question: will mail to it arrive, and is that phone number a
// phone number. Every answer is either null (fine) or one short reason the
// agent can read back to the visitor, so it asks them to check it instead of
// passing on a lead that bounces.
//
// One rule over all of it: when the check itself fails (DNS slow or down), the
// detail goes through. A lead someone has to double-check costs a minute; a real
// visitor turned away because a resolver hiccuped costs the lead.
//
// Throwaway email services are deliberately not blocked: the lists go stale,
// they hit real people, and a lead with a throwaway address is still a lead
// a person can judge.

import { promises as dnsPromises } from "node:dns";

const TIMEOUT_MS = 2500;

// The resolver, swappable so the tests never touch real DNS.
let resolver = dnsPromises;
export function setResolver(r) { resolver = r || dnsPromises; }

// RFC 2606 / 6761: names that can never be anyone's real address or site.
const RESERVED = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/i;

// The typos people actually make in the big providers. A hint, never a fix:
// the agent asks, the visitor retypes, and the server still only accepts what the
// visitor typed.
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "icloud.con": "icloud.com", "iclod.com": "icloud.com",
  "protonmail.con": "protonmail.com", "proton.me.com": "proton.me",
};

function withTimeout(p) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS))]);
}

// "Does not exist" answers from the resolver, as opposed to "could not ask".
const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

export const hostOf = (email) => String(email).split("@").pop().toLowerCase().replace(/\.$/, "");

// null when mail to this address can arrive (or we could not tell); else why not.
export async function emailProblem(email, { dns = resolver, relaxed = false } = {}) {
  const host = hostOf(email);
  if (relaxed) return null;
  if (RESERVED.test(host)) return `${host} is a reserved example domain, not a real mailbox`;
  if (TYPOS[host]) return `the domain ${host} looks like a typo of ${TYPOS[host]}`;
  try {
    const mx = await withTimeout(dns.resolveMx(host));
    // RFC 7505 null MX: the domain says outright it takes no mail.
    if (mx.length && mx.every((r) => r.exchange === "" || r.exchange === ".")) return `${host} accepts no email`;
    if (mx.length) return null;
  } catch (err) {
    if (!MISSING.has(err.code)) return null; // could not ask: let it through
  }
  // No MX record: mail falls back to the domain's own address (RFC 5321).
  try {
    const a = await withTimeout(dns.resolve4(host));
    return a.length ? null : `${host} does not receive email`;
  } catch (err) {
    return MISSING.has(err.code) ? `the domain ${host} does not exist` : null;
  }
}

// null when this site exists (or we could not tell); else why not.
export async function domainProblem(domain, { dns = resolver, relaxed = false } = {}) {
  const host = String(domain).toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
  if (relaxed) return null;
  if (RESERVED.test(host)) return `${host} is a reserved example domain, not a real site`;
  const tryResolve = async (name) => {
    try { return (await withTimeout(dns.resolve4(name))).length > 0; } catch (err) { return MISSING.has(err.code) ? false : null; }
  };
  const found = await tryResolve(host);
  if (found !== false) return null;
  // example.com and www.example.com can differ: either one is enough.
  const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  return (await tryResolve(alt)) === false ? `the site ${host} could not be found` : null;
}

// Phone numbers: 7 to 15 digits (the E.164 maximum), and not a placeholder.
export function phoneProblem(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length < 7) return "that phone number is too short";
  if (d.length > 15) return "that phone number is too long";
  if (/^(\d)\1+$/.test(d)) return "that phone number is a placeholder";
  const tail = d.replace(/^(00|0)?(31|32|33|34|39|44|49|351|370)?0?/, "");
  if (tail.length >= 6 && ("0123456789".includes(tail) || "9876543210".includes(tail))) return "that phone number is a placeholder";
  return null;
}
