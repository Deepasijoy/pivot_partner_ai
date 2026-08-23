// Lightweight, deterministic (non-LLM) detector for actionable job-seeking
// intent in a chat message. Used to decide whether the AI copilot should
// guide the user straight to the resume parser instead of a generic answer.
// Purely pattern-based — no network call, no scoring model.
const JOB_SEEKING_PATTERNS: RegExp[] = [
  /\b(i'?m|i am)\s+looking for\s+(a\s+)?(job|jobs|work)\b/i,
  /\blooking for\s+(a\s+)?(job|jobs|work)\b/i,
  /\bhelp me find\s+(a\s+)?(job|jobs|work|remote work|freelance work)\b/i,
  /\b(i\s+)?need\s+(a\s+)?job\b/i,
  /\bfind\s+(me\s+)?(a\s+)?jobs?\b/i,
  /\bfind\s+(me\s+)?work\b/i,
  /\bcontinue my career\b/i,
  /\bi want\s+(a\s+)?(freelance work|remote work|a job)\b/i,
  /\bwhat jobs can i do\b/i,
];

export function isActionableJobIntent(message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (!lower) return false;
  return JOB_SEEKING_PATTERNS.some((pattern) => pattern.test(lower));
}
