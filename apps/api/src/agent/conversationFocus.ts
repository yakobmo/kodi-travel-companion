import type { ConversationMessage } from "./kodi.js";

export interface ConversationFocus {
  effectiveMessage: string;
  locationAnchor?: string;
  correctionDetected: boolean;
  invalidatedAgentClaims: boolean;
}

function cleanAnchor(value: string) {
  return value
    .replace(/[?.!,;:]+$/u, "")
    .replace(/^(?:אזור|העיר|הכפר|ליד|סביב)\s+/u, "")
    .trim()
    .slice(0, 100);
}

function locationCorrection(text: string) {
  const match = text.match(
    /(?:התכוונתי|אני מתכוונ(?:ת|ן)|לא[^.?!]{0,30}אלא)\s+(?:ל|לאזור\s+|ליד\s+)?([^?.!\n]{2,100})/u
  );
  return match?.[1] ? cleanAnchor(match[1]) : undefined;
}

/**
 * Preserves the user's latest correction as structured state. This is memory,
 * not intent routing: the language model remains responsible for interpreting
 * the request and deciding how to answer it.
 */
export function resolveConversationFocus(
  currentMessage: string,
  recentMessages: ConversationMessage[] = []
): ConversationFocus {
  const userTurns = recentMessages
    .filter((item) => item.source !== "agent" && item.source !== "system")
    .slice(-10);
  const correctionTurn = [...userTurns].reverse().find((item) => locationCorrection(item.text));
  const locationAnchor = correctionTurn ? locationCorrection(correctionTurn.text) : undefined;
  const correctionDetected = Boolean(locationAnchor);
  const currentContainsAnchor = locationAnchor
    ? currentMessage.toLocaleLowerCase("he").includes(locationAnchor.toLocaleLowerCase("he"))
    : false;

  return {
    effectiveMessage:
      locationAnchor && !currentContainsAnchor
        ? `הקשר גאוגרפי מתוקן ומחייב: ${locationAnchor}. בקשת המשתמש הנוכחית: ${currentMessage}`
        : currentMessage,
    locationAnchor,
    correctionDetected,
    invalidatedAgentClaims: correctionDetected
  };
}
