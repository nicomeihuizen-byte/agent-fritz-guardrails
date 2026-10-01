// src/guards/typed-by-visitor.js
//
// Two rules about contact details, enforced on the server before any tool
// that sends something runs:
//
// 1. Only what the visitor typed. An email address, domain or phone number
//    the model passes to a tool must appear in the visitor's own messages.
//    A model cannot invent a lead, or "correct" an address into someone
//    else's inbox.
// 2. Read back first. A detail that appears for the first time in the
//    visitor's latest message has not been read back to them yet, so nothing
//    goes out on it. The agent repeats it and waits for a yes. A typo then
//    gets caught by the visitor, not by a bounce.
//
// Both return null when the call may go ahead, or a short instruction for the
// model (the tool result) when it may not.

const digits = (v) => String(v || "").replace(/\D/g, "");
const visitorLines = (conversation) => conversation.filter((m) => m.role === "user").map((m) => String(m.content).toLowerCase());

// Rule 1. needles: strings (email, domain) or { phone: "..." }.
export function notTypedByVisitor(conversation, needles) {
  const typed = visitorLines(conversation).join("\n");
  for (const n of needles.filter(Boolean)) {
    if (typeof n === "object") {
      if (digits(n.phone).length >= 7 && !digits(typed).includes(digits(n.phone))) {
        return "Rejected: the phone number must be exactly what the visitor typed. Ask them to type it.";
      }
    } else if (!typed.includes(String(n).toLowerCase())) {
      return `Rejected: ${n} must be exactly what the visitor typed. Ask them to type it.`;
    }
  }
  return null;
}

// Rule 2. Same needles. Returns the details that are new in the latest message.
export function newInLatest(conversation, needles) {
  const lines = visitorLines(conversation);
  if (!lines.length) return [];
  const latest = lines.at(-1);
  const earlier = lines.slice(0, -1).join("\n");
  return needles.filter(Boolean).filter((n) => {
    if (typeof n === "object") return digits(latest).includes(digits(n.phone)) && !digits(earlier).includes(digits(n.phone));
    const s = String(n).toLowerCase();
    return latest.includes(s) && !earlier.includes(s);
  });
}

export function readBackFirst(conversation, needles) {
  const fresh = newInLatest(conversation, needles);
  if (!fresh.length) return null;
  const what = fresh.map((n) => (typeof n === "object" ? "the phone number" : n)).join(" and ");
  return `Not sent: the visitor only just typed ${what}, and it has not been read back yet. Read every detail back exactly as you will send it and ask the visitor to confirm. Call again only after they say yes.`;
}
