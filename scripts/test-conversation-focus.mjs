import assert from "node:assert/strict";
import { resolveConversationFocus } from "../apps/api/dist/agent/conversationFocus.js";

const focus = resolveConversationFocus("נשכיר סירה. לאן אפשר לשוט על קו החוף?", [
  { author: "יעקב", source: "member", text: "לאן אפשר לשוט ליד מקום הלינה?" },
  { author: "קודי", source: "agent", text: "אפשר לשוט לקיפוי ולגשר קוקורו." },
  { author: "יעקב", source: "member", text: "התכוונתי לאזור Kala Nera" }
]);

assert.equal(focus.locationAnchor, "Kala Nera");
assert.equal(focus.correctionDetected, true);
assert.equal(focus.invalidatedAgentClaims, true);
assert.match(focus.effectiveMessage, /Kala Nera/u);
assert.match(focus.effectiveMessage, /נשכיר סירה/u);

const direct = resolveConversationFocus("מה מזג האוויר מחר?", []);
assert.equal(direct.effectiveMessage, "מה מזג האוויר מחר?");
assert.equal(direct.correctionDetected, false);

console.log("conversation focus regression: ok");
