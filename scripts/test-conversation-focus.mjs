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
assert.equal(focus.ellipticalContinuation, false);
assert.match(focus.effectiveMessage, /Kala Nera/u);
assert.match(focus.effectiveMessage, /נשכיר סירה/u);

const direct = resolveConversationFocus("מה מזג האוויר מחר?", []);
assert.equal(direct.effectiveMessage, "מה מזג האוויר מחר?");
assert.equal(direct.correctionDetected, false);

const confirmation = resolveConversationFocus("בדיוק", [
  { author: "יעקב", source: "member", text: "מה המרחק מהלינה האחרונה לנמל התעופה?" },
  { author: "קודי", source: "agent", text: "הלינה האחרונה היא Kalamiotou 19-23. לחשב משם לנמל התעופה?" },
  { author: "יעקב", source: "member", text: "בדיוק" }
]);
assert.equal(confirmation.ellipticalContinuation, true);
assert.match(confirmation.effectiveMessage, /Kalamiotou 19-23/u);
assert.match(confirmation.effectiveMessage, /נמל התעופה/u);

const shortNewTopic = resolveConversationFocus("מלון ביום האחרון", [
  { author: "יעקב", source: "member", text: "מה דעתך על האגם?" },
  { author: "קודי", source: "agent", text: "זה אגם יפה מאוד." },
  { author: "יעקב", source: "member", text: "מלון ביום האחרון" }
]);
assert.equal(shortNewTopic.ellipticalContinuation, false);
assert.equal(shortNewTopic.effectiveMessage, "מלון ביום האחרון");

console.log("conversation focus regression: ok");
