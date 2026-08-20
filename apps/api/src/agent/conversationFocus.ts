import type { ConversationMessage } from "./kodi.js";

export interface ConversationFocus {
  effectiveMessage: string;
  locationAnchor?: string;
  continuationContext?: string;
  ellipticalContinuation: boolean;
  correctionDetected: boolean;
  invalidatedAgentClaims: boolean;
}

function isEllipticalContinuation(text: string) {
  const normalized = text.trim().replace(/[.!?…]+$/u, "").trim();
  return /^(?:כן|בדיוק|נכון|מעולה|זהו|כך|קדימה|אוקיי|בסדר|תעשה|בצע|המשך|בדוק(?:\s+עכשיו)?|כן\s+בדיוק)$/iu.test(normalized);
}

function priorConversationContext(currentMessage: string, recentMessages: ConversationMessage[]) {
  if (!isEllipticalContinuation(currentMessage)) return undefined;

  const prior = [...recentMessages];
  const last = prior.at(-1);
  if (last?.source !== "agent" && last?.text.trim() === currentMessage.trim()) prior.pop();

  let lastAgentIndex = -1;
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    if (prior[index]?.source === "agent") {
      lastAgentIndex = index;
      break;
    }
  }
  if (lastAgentIndex < 0) return undefined;
  const lastMember = [...prior.slice(0, lastAgentIndex)]
    .reverse()
    .find((item) => item.source !== "agent" && item.source !== "system");
  const lastAgent = prior[lastAgentIndex];
  if (!lastMember || !lastAgent) return undefined;

  return `בקשת המשתמש שעדיין בדיון: ${lastMember.text}\nהתשובה או ההצעה האחרונה שקיבלה כעת המשך: ${lastAgent.text}`;
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
  const continuationContext = priorConversationContext(currentMessage, recentMessages);
  const contextualMessage = continuationContext
    ? `${continuationContext}\nהמשך המשתמש הנוכחי: ${currentMessage}`
    : currentMessage;

  return {
    effectiveMessage:
      locationAnchor && !currentContainsAnchor
        ? `הקשר גאוגרפי מתוקן ומחייב: ${locationAnchor}. ${contextualMessage}`
        : contextualMessage,
    locationAnchor,
    continuationContext,
    ellipticalContinuation: Boolean(continuationContext),
    correctionDetected,
    invalidatedAgentClaims: correctionDetected
  };
}
