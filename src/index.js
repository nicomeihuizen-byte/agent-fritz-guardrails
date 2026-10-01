// The guardrails from Agent Fritz, as a library. See README.md.
export { notTypedByVisitor, newInLatest, readBackFirst } from "./guards/typed-by-visitor.js";
export { emailProblem, domainProblem, phoneProblem, setResolver } from "./guards/contact-check.js";
export { NumberGuard, siteDigits, WITHHELD } from "./guards/numbers.js";
export { RegisterGuard, isInformal, swapToFormal, toFormal, setRewriter } from "./guards/register-nl.js";
export { verifyQuote } from "./guards/verify-quote.js";
