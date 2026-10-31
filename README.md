Moved to: https://codeberg.org/meihuizen-ai


# Agent Fritz: the guardrails, open

[Agent Fritz](https://www.meihuizen.ai/projects/agent-fritz.html) is a sales agent for websites that only says what the site says. It runs on meihuizen.ai, in eight languages: ask it something, and watch it read the page before it answers.

**This repository is not Agent Fritz.** Fritz is a custom build and stays closed: its prompt, its sales method, booking, live chat and hand-over to a human are the product. What is here is the part that proves the approach: the rules the server enforces whatever the model says, the trap-test harness, and a minimal demo agent that shows them in place.

Open the part that is proof. Keep the part that is the product.

## The idea in one line

A prompt is a request. A rule that must hold is enforced in code, not requested in a prompt.

## The guards

| Guard | What it stops | File |
|---|---|---|
| Typed by the visitor | The model inventing a lead, or "correcting" an address into someone else's inbox. An email, domain or phone number is only used if the visitor typed it. | `src/guards/typed-by-visitor.js` |
| Read back first | A typo becoming a lead that bounces. A detail typed in this very message is read back and confirmed before anything is sent. | `src/guards/typed-by-visitor.js` |
| Mail that arrives | Reserved domains, domains that do not exist or take no mail, common provider typos. Fails open when DNS is down: a resolver hiccup never turns a real visitor away. | `src/guards/contact-check.js` |
| No invented numbers | A plausible phone number that is not on the site. Works on a streamed answer, however the number is split across chunks. | `src/guards/numbers.js` |
| Proof that is real | A "source" quote the page does not contain. The quote reaches the visitor only if it is literally on the page it names. | `src/guards/verify-quote.js` |
| Formal Dutch | A Dutch visitor addressed with "je" on a site that says "u". Sentence by sentence, rewritten and checked, with a blunt fallback that is never informal. | `src/guards/register-nl.js` |

Every guard has its own tests in `test/`. None of them call a real model or real DNS.

## The demo agent

`src/agent/agent.mjs` is about 120 lines: it reads the pages of a site, answers from them, names its source, and can pass a contact request on, with every guard above in place. It answers about **Brackwater**, a company that does not exist (`sample-site/`), so the traps can be honest ones.

```bash
# bash, in the repository folder
npm test                                   # the guards and the demo agent, no API key needed
ANTHROPIC_API_KEY=... npm run ask -- "What does Tidewatch cost?"
ANTHROPIC_API_KEY=... npm run evals        # the trap set, against the real model
```

## The trap set

`evals/questions.json` asks Brackwater the questions a careless agent gets wrong: the phone line that does not exist, the VAT number not issued yet, the team of engineers that is one person, the office in Amsterdam, the client harbours it may not name, a discount nobody offered, an email address it is asked to make up. A trap that fails means the change does not ship. Test runs send nothing.

Fritz runs the same kind of set, written for meihuizen.ai, on every change before it goes live.

## What is not here

The prompt and the sales method (SPIN, Challenger, MEDDPICC) Fritz works with. Booking into a calendar. Bringing a human into the chat, and taking instructions from them there. The knowledge build from a live site. The scan offer. Those are built per client, around their pages, their languages, their actions and their traps.

If you want a Fritz on your site: [meihuizen.ai/projects/agent-fritz.html](https://www.meihuizen.ai/projects/agent-fritz.html).

## Licence

MIT. Use the guards; they are hygiene, and the web is better with more of them.
