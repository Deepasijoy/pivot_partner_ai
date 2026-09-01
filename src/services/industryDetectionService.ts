import { GENERIC_SECTION_HEADER_LINE_PATTERN } from './skillExtractionService';

// Extracted out of resumeParserService.ts (which has a Vite-only `?url`
// asset import at module scope, so it can't be loaded directly under plain
// `node --test`) — mirrors why skillExtractionService.ts was split out the
// same way: a small, directly-testable, dependency-free unit.

// Broad career-domain context, not an occupation taxonomy — kept small and
// non-exhaustive on purpose (see skillExtractionService.ts for the same
// principle applied to skills). A missed domain just falls through to the
// 'General Business' default below; it never blocks anything downstream.
const INDUSTRY_KEYWORDS: Record<string, string> = {
  fintech: 'Fintech',
  finance: 'Finance',
  healthcare: 'Healthcare',
  'e-commerce': 'E-commerce',
  ecommerce: 'E-commerce',
  education: 'Education',
  retail: 'Retail',
  saas: 'SaaS',
  marketing: 'Marketing',
  logistics: 'Logistics',
  consulting: 'Consulting',
  // 'media' (bare) deliberately removed — see the confirmed bug: it's a
  // genuine, complete word inside "social media"/"paid media", which are
  // digital-marketing terms with no connection to journalism/publishing.
  // 'journalism' alone is specific enough to never collide; these three
  // additions cover the same real-world domain (reporting, newsrooms,
  // newspapers) without reintroducing an ambiguous bare word. Deliberately
  // does NOT add 'reporting' or 'publishing' — both are common in
  // unrelated business contexts ("financial reporting", "publishing
  // research") and would reintroduce the same class of false positive.
  journalism: 'Journalism & Media',
  journalist: 'Journalism & Media',
  newsroom: 'Journalism & Media',
  newspaper: 'Journalism & Media',
  'marine biology': 'Marine Science',
  'marine science': 'Marine Science',
  oceanography: 'Marine Science',
  laboratory: 'Life Sciences',
  biology: 'Life Sciences',
  biotech: 'Life Sciences',
  environmental: 'Environmental Science',
  ecology: 'Environmental Science',
  operations: 'Operations',
};

// Keywords whose bare presence — even once — is NOT reliable enough on its
// own to mark a candidate's whole career as being IN that industry. A
// single passing mention (e.g. "Digital Marketing" listed once among many
// skills, from a fellowship or a single project) is common for people who
// used the skill in a narrow context without that being their actual
// professional domain — the confirmed complaint this fixes. Evidence must
// be REINFORCED (see isReinforced below) before the label is included.
// Every other keyword in INDUSTRY_KEYWORDS is specific/unambiguous enough
// that even a single mention already means something (e.g. "finance",
// "retail", "operations", "journalism") and keeps its existing, unchanged,
// single-mention-sufficient behavior — this set is deliberately small and
// only grows if a future keyword turns out to have the same problem.
const REINFORCEMENT_REQUIRED: ReadonlySet<string> = new Set(['marketing']);

// A role/tenure-defining mention is authoritative even at a single
// occurrence — "Marketing Manager", "Head of Marketing", "Marketing
// professional" describe an actual job, not an incidental skill mention.
const ROLE_SUFFIXES = 'manager|director|lead|head|specialist|professional|executive|coordinator|analyst|officer|strategist';

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasRoleTitleContext(lowerText: string, keyword: string): boolean {
  const escaped = escapeForRegExp(keyword);
  const roleAfter = new RegExp(`\\b${escaped}\\s+(?:${ROLE_SUFFIXES})\\b`);
  const roleBefore = new RegExp(`\\b(?:${ROLE_SUFFIXES})\\s+of\\s+${escaped}\\b`);
  return roleAfter.test(lowerText) || roleBefore.test(lowerText);
}

// Same proximity-window idiom skillExtractionService.ts's
// fuzzyMatchesNearby already uses for multi-word skill matching — reused
// here so an explicit "N years of marketing experience" / "N years of
// experience in marketing" (either word order — real resumes phrase this
// both ways) counts as authoritative regardless of exact wording.
const YEARS_MENTION_WINDOW = 60;

function nearYearsExperienceMention(lowerText: string, keyword: string): boolean {
  const yearsPattern = /\d+\+?\s*years?/g;
  let match: RegExpExecArray | null;
  while ((match = yearsPattern.exec(lowerText))) {
    const windowStart = Math.max(0, match.index - YEARS_MENTION_WINDOW);
    const windowEnd = Math.min(lowerText.length, match.index + match[0].length + YEARS_MENTION_WINDOW);
    if (lowerText.slice(windowStart, windowEnd).includes(keyword)) return true;
  }
  return false;
}

function countWholeWordOccurrences(lowerText: string, keyword: string): number {
  const matches = lowerText.match(new RegExp(`\\b${escapeForRegExp(keyword)}\\b`, 'g'));
  return matches ? matches.length : 0;
}

// A REINFORCEMENT_REQUIRED keyword only counts once there's more than a
// single incidental mention: either it appears more than once anywhere in
// the resume, or that one mention is itself authoritative (a role/title
// context, or explicit tenure). This is the "meaningful professional
// experience, not an isolated keyword mention" distinction — applied only
// to the keywords that need it, never globally.
function isReinforced(lowerText: string, keyword: string): boolean {
  if (countWholeWordOccurrences(lowerText, keyword) >= 2) return true;
  if (hasRoleTitleContext(lowerText, keyword)) return true;
  if (nearYearsExperienceMention(lowerText, keyword)) return true;
  return false;
}

// Excludes bare resume section-heading lines ("Education:", "Experience:",
// "Skills:", "Certifications:", "Projects:", ...) from the text before
// industry-keyword scanning even sees it — the same structural signal
// skillExtractionService.ts already uses to keep section headings out of
// "Your Skills" (GENERIC_SECTION_HEADER_LINE_PATTERN). Without this, a
// literal "Education:" heading line always contained the 'education'
// keyword via plain substring matching, regardless of the candidate's
// actual profession — the confirmed bug (it silently overrode a Marketing
// candidate's real industry in resolveCandidateDomain(), since that
// function returns on the first industry that maps to a known domain).
// Content UNDER a heading is untouched, so a genuine mention of
// "education" in flowing prose (a Summary sentence, a degree line naming
// the field of study) is never suppressed — only the bare heading LINE
// itself is removed.
function stripSectionHeaderLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !GENERIC_SECTION_HEADER_LINE_PATTERN.test(line.trim()))
    .join('\n');
}

export function detectIndustries(text: string): string[] {
  const lowerText = stripSectionHeaderLines(text).toLowerCase();
  const found = new Set<string>();
  for (const [keyword, label] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (!lowerText.includes(keyword)) continue;
    if (REINFORCEMENT_REQUIRED.has(keyword) && !isReinforced(lowerText, keyword)) continue;
    found.add(label);
  }
  return found.size > 0 ? Array.from(found) : ['General Business'];
}
