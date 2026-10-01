// Only what the visitor typed, and only after it was read back.
import assert from "node:assert/strict";
import { notTypedByVisitor, newInLatest, readBackFirst } from "../src/guards/typed-by-visitor.js";

const said = (...lines) => lines.map((content, i) => ({ role: i % 2 ? "assistant" : "user", content }));

assert.match(notTypedByVisitor(said("contact me at real@person.example"), ["made@up.example"]), /exactly what the visitor typed/, "an invented address is refused");
assert.equal(notTypedByVisitor(said("contact me at Real@Person.example"), ["real@person.example"]), null, "case does not matter");
assert.match(notTypedByVisitor(said("call me on 06-1234 5678"), [{ phone: "+31 6 99999999" }]), /phone number/, "an invented number is refused");
assert.equal(notTypedByVisitor(said("call me on 06-1234 5678"), [{ phone: "0612345678" }]), null, "spacing does not matter");

assert.deepEqual(newInLatest(said("Contact me: ana@x.example"), ["ana@x.example"]), ["ana@x.example"], "typed just now");
assert.deepEqual(newInLatest(said("Contact me: ana@x.example", "To confirm: ana@x.example?", "yes"), ["ana@x.example"]), [], "read back, then confirmed");
assert.ok(readBackFirst(said("ana@typo.example", "To confirm: ana@typo.example?", "no, it's ana@right.example"), ["ana@right.example"]), "a correction is read back again");
assert.equal(readBackFirst(said("ana@x.example", "To confirm?", "yes"), ["ana@x.example"]), null);
console.log("ok   typed by the visitor, read back first: 8 checks");
