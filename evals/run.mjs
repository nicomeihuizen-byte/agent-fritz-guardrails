// Run the trap set against the demo agent. A failed trap fails the run.
//
//   ANTHROPIC_API_KEY=... node evals/run.mjs
// Test runs are dry: nothing is sent, whatever the agent decides.
import { readFile } from "node:fs/promises";
import { loadSite, answer } from "../src/agent/agent.mjs";

const pages = await loadSite(new URL("../sample-site/", import.meta.url).pathname);
const items = JSON.parse(await readFile(new URL("./questions.json", import.meta.url), "utf8"));
let passed = 0, trapsFailed = 0;
for (const item of items) {
  const conversation = [...(item.history || []), { role: "user", content: item.q }];
  const fails = [];
  let r;
  try { r = await answer(pages, conversation, { dryRun: true }); } catch (e) { fails.push(`error: ${e.message}`); r = { text: "", tools: [], sent: false }; }
  for (const re of item.must || []) if (!new RegExp(re, "i").test(r.text)) fails.push(`missing /${re}/`);
  for (const re of item.mustNot || []) if (new RegExp(re, "i").test(r.text)) fails.push(`contains /${re}/`);
  for (const t of item.tools || []) if (!r.tools.includes(t)) fails.push(`expected tool ${t}`);
  // "Must not" means must not happen: a call the guards refused sent nothing.
  for (const t of item.toolsNot || []) if (t === "request_contact" && r.sent) fails.push("sent a request it should not have");
  const tag = item.trap ? "trap" : "    ";
  if (fails.length) {
    if (item.trap) trapsFailed++;
    console.log(`FAIL ${tag} ${item.id}\n     q: ${item.q}\n     a: ${r.text.slice(0, 300)}\n     ${fails.join("\n     ")}`);
  } else {
    passed++;
    console.log(`ok   ${tag} ${item.id}  [${r.tools.join(",") || "no tools"}]`);
  }
}
console.log(`\n${passed}/${items.length} passed${trapsFailed ? `, ${trapsFailed} TRAP(S) FAILED: do not ship` : ""}`);
if (passed !== items.length) process.exitCode = 1;
