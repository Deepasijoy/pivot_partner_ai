// Deterministic, keyword-based detector for whether an assistant chat
// reply touches on visa/work-authorization topics. SYSTEM_PROMPT
// (server/server.js) already tells the model to hedge this correctly, but
// a system prompt cannot guarantee every generation phrases it exactly
// right — this attaches a fixed, always-correct disclaimer in the chat UI
// itself whenever the topic comes up, independent of what the model said.
const VISA_TOPIC_PATTERN = /\b(visa|permits?|work authorization|immigration)\b/i;

export const VISA_DISCLAIMER_TEXT =
  'Work-permit rules depend on your situation — check the official immigration service.';

export function mentionsVisaOrWorkAuthorization(text: string): boolean {
  return VISA_TOPIC_PATTERN.test(text);
}
