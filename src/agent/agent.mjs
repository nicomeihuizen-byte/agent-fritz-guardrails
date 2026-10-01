// src/agent/agent.mjs
//
// A minimal site agent, to show the guardrails in place. It is not Agent
// Fritz: no booking, no live chat, no sales method, no streaming. It reads
// the pages of a site, answers from them, names its source, and can pass a
// contact request on. Every rule that must hold is enforced in this file or
// in ../guards, not in the prompt.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { notTypedByVisitor, readBackFirst } from "../guards/typed-by-visitor.js";
import { emailProblem, phoneProblem } from "../guards/contact-check.js";
import { NumberGuard, siteDigits } from "../guards/numbers.js";
import { RegisterGuard } from "../guards/register-nl.js";
import { verifyQuote } from "../guards/verify-quote.js";

const MODEL = process.env.MODEL || "claude-haiku-4-5";
const MAX_ROUNDS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function loadSite(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(files.map(async (f) => ({ path: f, text: await readFile(path.join(dir, f), "utf8") })));
}

function systemPrompt(pages) {
  const index = pages.map((p) => `- ${p.path}: ${p.text.split("\n")[0].replace(/^#\s*/, "")}`).join("\n");
  return `You answer questions about this website, and only from its pages.
Before you state any fact, open the page with read_page. If no page says it, say plainly that it is not on the site. Never guess, estimate or fill a gap.
Answer in the visitor's language, briefly. In Dutch, address the visitor with "u".
To pass a contact request on, you need a name and an email address the visitor typed. Read the details back and ask the visitor to confirm before you call request_contact.
End a normal answer with one line: SOURCE: <page> | <one sentence copied exactly from that page>.

Pages:
${index}`;
}

const TOOLS = [
  { name: "read_page", description: "Read one page of the site.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "request_contact", description: "Pass the visitor's request to a person. Only after the visitor confirmed the details you read back.", input_schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, topic: { type: "string" } }, required: ["email", "topic"] } },
];

// The one tool that sends something: every check runs before it does.
async function requestContact(input, conversation, { dryRun, deliver }) {
  const email = String(input.email || "").trim();
  const phone = String(input.phone || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, content: "Rejected: the email address is not valid. Ask the visitor to check it." };
  const needles = [email, phone ? { phone } : null];
  const notTyped = notTypedByVisitor(conversation, needles);
  if (notTyped) return { ok: false, content: notTyped };
  const fresh = readBackFirst(conversation, needles);
  if (fresh) return { ok: false, content: fresh };
  const problem = (await emailProblem(email, { relaxed: dryRun })) || (phone ? phoneProblem(phone) : null);
  if (problem) return { ok: false, content: `Not sent: ${problem}. Read it back to the visitor and ask them to check it. Never correct it yourself.` };
  if (!dryRun) await deliver({ ...input, email, phone, conversation });
  return { ok: true, content: dryRun ? "Sent (test run, nothing sent)." : "Sent. A person has it and will reply." };
}

async function callModel(system, messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error(`model ${r.status}`);
  return r.json();
}

// conversation: [{ role: "user"|"assistant", content: string }, ...], ending with the visitor.
// Returns { text, source, tools, sent }.
export async function answer(pages, conversation, { dryRun = false, deliver = async () => {} } = {}) {
  const messages = conversation.map((m) => ({ role: m.role, content: m.content }));
  const tools = [];
  let raw = "";
  let sent = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await callModel(systemPrompt(pages), messages);
    messages.push({ role: "assistant", content: turn.content });
    raw += turn.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (turn.stop_reason !== "tool_use") break;
    const results = [];
    for (const call of turn.content.filter((b) => b.type === "tool_use")) {
      tools.push(call.name);
      let res;
      if (call.name === "read_page") {
        const page = pages.find((p) => p.path === call.input.path);
        res = page ? { ok: true, content: page.text } : { ok: false, content: `No such page. Pages: ${pages.map((p) => p.path).join(", ")}` };
      } else if (call.name === "request_contact") {
        res = await requestContact(call.input, conversation, { dryRun, deliver });
        if (res.ok) sent = true;
      } else {
        res = { ok: false, content: "Unknown tool." };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: res.content, is_error: !res.ok });
    }
    messages.push({ role: "user", content: results });
  }

  // The proof line: kept only if the sentence is literally on the page.
  let source = null;
  const m = /\n?SOURCE:\s*([^|\n]+)\|\s*(.+)\s*$/.exec(raw);
  if (m) {
    raw = raw.slice(0, m.index);
    const quote = verifyQuote(pages, m[1].trim(), m[2]);
    if (quote) source = { page: m[1].trim(), quote };
  }

  // No phone number that is not on the site or typed by the visitor.
  const numbers = new NumberGuard(`${siteDigits({ pages })}|${conversation.filter((m) => m.role === "user").map((m) => m.content.replace(/\D/g, "")).join("|")}`);
  let text = numbers.push(raw) + numbers.flush();

  // A Dutch answer addresses the visitor with "u".
  if (/\b(het|een|de|u|uw|niet|van)\b/i.test(text) && !/\b(the|and|you)\b/i.test(text)) {
    let out = "";
    const g = new RegisterGuard((t) => { out += t; });
    g.push(text);
    await g.drain();
    text = out;
  }
  return { text: text.trim(), source, tools, sent };
}
