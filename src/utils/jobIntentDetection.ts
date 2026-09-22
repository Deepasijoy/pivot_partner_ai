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

// Same deterministic, pattern-based approach as JOB_SEEKING_PATTERNS above —
// no network call, no scoring model. Used to route move-planning intent to
// the Relocation tab instead of a generic Groq round-trip.
const RELOCATION_PLANNING_PATTERNS: RegExp[] = [
  /\bhelp( me)? plan (my|our) move\b/i,
  /\bplan (my|our) move\b/i,
  /\bhelp( me)? relocate\b/i,
  /\bhelp with (my|our) relocation\b/i,
  /\brelocation plan\b/i,
];

export function isActionableRelocationIntent(message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (!lower) return false;
  return RELOCATION_PLANNING_PATTERNS.some((pattern) => pattern.test(lower));
}

// Same deterministic, pattern-based approach as the two detectors above.
// Distinct from JOB_SEEKING_PATTERNS on purpose: "analyze my skills" and
// "find a job" are different intents that happen to need the same resume-
// upload prerequisite — without a resume in context, the AI copilot has
// nothing to analyze and (per real observed behavior) falls back to asking
// a 5-point manual questionnaire (roles, education, skills, goal,
// relocation) instead of pointing the user at the app's own working
// upload -> skill-extraction -> scoreJob() pipeline. Includes the exact
// text of SideBar.tsx's own "Find my skill gaps" quick-start prompt, since
// that's a real, already-wired-up trigger for this same scenario.
const SKILL_ANALYSIS_PATTERNS: RegExp[] = [
  /\bfind my skill\s?gaps?\b/i,
  /\b(analyze|analyse|assess|review|evaluate)\s+my\s+skills?\b/i,
  /\bwhat\s+(are|is)?\s*my\s+skill\s?gaps?\b/i,
  /\bskill\s?gap\s+analysis\b/i,
  /\bwhat\s+skills?\s+(am i|do i)\s+(missing|lacking|lack)\b/i,
  /\bam\s+i\s+qualified\s+for\b/i,
  /\bcheck\s+my\s+skills?\b/i,
  /\b(analyze|analyse|assess|review)\s+my\s+(resume|cv|background|experience|profile)\b/i,
];

// The fixed phrases above only catch exact shapes ("find my skill gaps",
// "assess my skills my resume") — real free-typed messages combine the same
// underlying concepts in an order/verb none of those phrases predicted, e.g.
// "Get my free skill gap assessment" (the landing page's own hero CTA copy,
// which the fixed list above didn't catch — "assessment" isn't "analysis",
// and there's no leading verb). Rather than adding an unbounded list of
// exact phrases, these two combinators match on the underlying concept
// showing up anywhere in the message: "skill(s)" alongside a
// gap/assess/analyze/review/evaluate word, or "my resume/cv" alongside an
// analyze/review/check/assess word. "my" is required before resume/cv (not
// just "resume") so "let's resume the meeting" doesn't combine with an
// unrelated "review"/"check" elsewhere in the same message. The analy[sz]
// pattern deliberately requires -e/-es/-ed/-ing/-is right after "analy" so
// it matches analyze/analyse/analysis and their inflections but not
// "analyst" or "analytical" — both real job-title/domain words this app's
// own chat legitimately uses (e.g. "data analyst"), which must never
// short-circuit into the resume-upload flow.
const SKILL_WORD = /\bskills?\b/i;
const SKILL_ANALYSIS_ACTION_WORD = /\b(gaps?|assess(?:ment)?|analy[sz](?:e|es|ed|ing|is)|review(?:ed|ing)?|evaluat(?:e|ion))\b/i;
const MY_RESUME_OR_CV = /\bmy\s+(?:resume|cv)\b/i;
const RESUME_ACTION_WORD = /\b(analy[sz](?:e|es|ed|ing|is)|review(?:ed|ing)?|check(?:ed|ing)?|assess(?:ment)?)\b/i;

export function isActionableSkillAnalysisIntent(message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (!lower) return false;
  if (SKILL_ANALYSIS_PATTERNS.some((pattern) => pattern.test(lower))) return true;
  if (SKILL_WORD.test(lower) && SKILL_ANALYSIS_ACTION_WORD.test(lower)) return true;
  if (MY_RESUME_OR_CV.test(lower) && RESUME_ACTION_WORD.test(lower)) return true;
  return false;
}
