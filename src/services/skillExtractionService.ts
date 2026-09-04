import type { Skill } from '../types';
import { mockSkillTaxonomy } from './mockData';

// Shared skill-extraction logic for BOTH resume text and job-description
// text — a single implementation so the two call sites (resumeParserService.ts,
// jobService.ts) can never drift apart again. Previously each had its own
// detectSkills(): resumeParserService.ts's version included whole-word
// matching, an alias table, and fuzzy nearby-token matching for multi-word
// skill names, while jobService.ts's version only did a plain substring
// check against the taxonomy — meaning a job description saying
// "spreadsheets required" would not detect Excel, while a resume saying the
// same word would. Both now call detectSkills() below, so both benefit from
// the same aliases and matching robustness.

// ---------------------------------------------------------------------------
// Listed-skill-phrase preservation — never invents a skill, only ever copies
// text the source document itself already labeled as a skills/requirements
// list (a "Skills:" section header, or an inline "Requirements: X, Y, Z").
// ---------------------------------------------------------------------------

const LABEL_ALTERNATION =
  '(?:technical skills|core skills|key skills|skills|competencies|tools(?: ?(?:&|and) ?technologies)?|tech stack|requirements|qualifications|what you.?ll need|you (?:have|bring)|must have|nice to have)';

// "Skills: Python, SQL, Excel" or "Requirements: Kotlin and Snowflake." —
// anywhere in the text, not anchored to a line start, since job-listing
// text (from Adzuna) is often one long paragraph with no real line breaks.
const INLINE_LABEL_PATTERN = new RegExp(`${LABEL_ALTERNATION}\\s*:\\s*([^.\\n]{1,200})`, 'gi');

// A line that is *only* a section header (resume-style, one heading per
// line, as produced by the PDF text extractor's per-row output).
const SECTION_HEADER_LINE_PATTERN = new RegExp(`^${LABEL_ALTERNATION}\\s*:?\\s*$`, 'i');

// ANY resume section header, not just skill/requirement-labeled ones — e.g.
// "Experience:", "Education:", "Projects:", "Certifications:". This is a
// structural/formatting signal (a short, standalone line ending in a
// colon), never a fixed word list — it stops a "Skills:" section scan at
// "Volunteer Work:" or "Publications:" exactly the same way it stops it at
// "Experience:", with no per-word hardcoding. A resume line composed only
// of a short label followed by a colon essentially never occurs as an
// actual skill/list item (a real skill name is not, itself, formatted as
// "Word:" on its own line), so this pattern doesn't need to special-case
// skills at all to stay safe.
//
// PDF text extraction (resumeParserService.ts's assembleReadableText)
// drops blank lines entirely — a blank visual gap between two sections
// produces zero text items, so it never becomes its own row — which is why
// relying on "stop at a blank line" alone (the only other stop condition
// below) was never sufficient: a "Skills:" section immediately followed by
// "Experience:"/"Education:" has no blank-line boundary left to detect in
// the extracted text at all.
// Exported so other resume-text extractors facing the exact same class of
// bug (a bare heading line's own words leaking into a keyword scan) can
// reuse the identical structural signal instead of re-deriving their own
// slightly-different pattern — see resumeParserService.ts's
// detectIndustries(), which reuses this to stop "Education:" from
// false-positiving as an industry.
export const GENERIC_SECTION_HEADER_LINE_PATTERN = /^[A-Za-z][A-Za-z /&-]{0,38}:$/;

const MAX_SECTION_LINES = 8;
const MIN_PHRASE_LENGTH = 2;
const MAX_PHRASE_LENGTH = 40; // longer reads as a sentence, not a skill name

function splitIntoPhrases(chunk: string): string[] {
  // A colon inside a labeled section's own line is almost always a
  // sub-label of its own ("Databases: SQL, MySQL", "Visualization & BI
  // Tools: Power BI, DAX, Power Query") rather than part of a skill name —
  // no taxonomy or alias entry in this codebase contains a colon. Discard
  // everything up to and including the first colon before splitting on
  // anything else, so the label itself is dropped outright rather than
  // surviving as its own phrase — merely adding ':' to the delimiter class
  // below (splitting, but keeping both sides) would still turn a label
  // like "Visualization & BI Tools" into a fabricated general-category
  // skill, since it has no taxonomy/alias entry to quietly resolve against
  // the way "Databases" happens to.
  const withoutLeadingLabel = chunk.includes(':') ? chunk.slice(chunk.indexOf(':') + 1) : chunk;

  return withoutLeadingLabel
    .split(/[,;•·|\n()]|(?:^|\s)-\s/)
    .map((phrase) => phrase.replace(/^[\s\-•·*]+|[\s.,:;]+$/g, '').trim())
    .filter((phrase) => phrase.length >= MIN_PHRASE_LENGTH && phrase.length <= MAX_PHRASE_LENGTH)
    .filter((phrase) => !/^\d+$/.test(phrase));
}

/**
 * Finds candidate skill phrases in `text` — only from content that follows
 * an explicit skills/requirements-style label, never from unlabeled prose.
 * Case-insensitively deduped, original casing preserved.
 */
export function extractListedSkillPhrases(text: string): string[] {
  const phrases: string[] = [];

  for (const match of text.matchAll(INLINE_LABEL_PATTERN)) {
    phrases.push(...splitIntoPhrases(match[1]));
  }

  const lines = text.split('\n').map((line) => line.trim());
  for (let i = 0; i < lines.length; i++) {
    if (!SECTION_HEADER_LINE_PATTERN.test(lines[i])) continue;

    for (let j = i + 1; j < lines.length && j <= i + MAX_SECTION_LINES; j++) {
      const next = lines[j];
      if (!next) break;
      if (SECTION_HEADER_LINE_PATTERN.test(next) || GENERIC_SECTION_HEADER_LINE_PATTERN.test(next)) break;
      phrases.push(...splitIntoPhrases(next));
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const phrase of phrases) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
  }
  return result;
}

/**
 * Builds a Skill for a phrase that didn't match the taxonomy (by exact name
 * or alias) — preserves it as-written rather than discarding it. Neutral,
 * non-invented defaults throughout: 'general' category (word count or
 * single-vs-multi-token shape is not a reliable signal of technical vs.
 * business nature — e.g. "Advertising", "Journalism", "Marine Biology" are
 * all one-or-few-word phrases that aren't "technical," so guessing from
 * shape alone produces wrong answers, not just imprecise ones), 'medium'
 * demand (the same value calculateSkillGaps already treats as its
 * baseline/default case), and a filler proficiency (read nowhere else in
 * the codebase, so its exact value is inert).
 */
export function buildUnknownSkill(phrase: string): Skill {
  return {
    name: phrase,
    category: 'general',
    demandLevel: 'medium',
    proficiency: 60,
  };
}

// ---------------------------------------------------------------------------
// Taxonomy + alias matching — shared by resume and job-description parsing.
// ---------------------------------------------------------------------------

// Free-text phrasing that commonly shows up in resumes or job descriptions
// but doesn't literally match a taxonomy skill name. Every value here must
// be an exact taxonomy skill name — this only maps wording onto existing
// skills, it never invents new ones. Adapted from
// server/utils/skillNormalization.ts's ALIAS_MAP.
export const SKILL_ALIASES: Record<string, string> = {
  'financial reporting': 'Financial Analysis',
  'data reporting': 'Data Analysis',
  'stakeholder coordination': 'Stakeholder Management',
  spreadsheets: 'Excel',
  spreadsheet: 'Excel',
  'ms excel': 'Excel',
  'microsoft excel': 'Excel',
  js: 'JavaScript',
  'javascript programming': 'JavaScript',
  'react.js': 'React',
  reactjs: 'React',
  node: 'Node.js',
  nodejs: 'Node.js',
  ml: 'Machine Learning',
  'artificial intelligence': 'Machine Learning',
  'aws cloud': 'AWS',
  'amazon web services': 'AWS',
  'cloud computing': 'Cloud Architecture',
  'agile methodology': 'Agile/Scrum',
  scrum: 'Agile/Scrum',
  'project coordination': 'Project Management',
  'project scoping': 'Project Management',
  'project delivery': 'Project Management',
  'search engine optimization': 'SEO',
  'client relationship management': 'Customer Success',
  'crm software': 'CRM (Salesforce/HubSpot)',
  salesforce: 'CRM (Salesforce/HubSpot)',
  hubspot: 'CRM (Salesforce/HubSpot)',
  'people management': 'HR Management',
  'talent acquisition': 'Recruitment',
  hiring: 'Recruitment',
  'budget planning': 'Budgeting',
  'financial forecasting': 'Forecasting',
  presenting: 'Public Speaking',
  'sql database': 'SQL',
  'sql server': 'SQL',
  databases: 'SQL',
  'power bi dashboards': 'Power BI',
  powerbi: 'Power BI',
  'power-bi': 'Power BI',
  'ms power bi': 'Power BI',
  'data visualization': 'Tableau',
  'data analytics': 'Data Analysis',
  'business analytics': 'Data Analysis',
  'data analyst': 'Data Analysis',
  'python programming': 'Python',
  'python scripting': 'Python',
  'advanced excel': 'Excel',
  'excel modeling': 'Excel',
  'process improvement': 'Process Optimization',
  'customer relationship management': 'CRM (Salesforce/HubSpot)',
  'customer service': 'Customer Success',
  'sales management': 'Sales Strategy',
  'digital marketing': 'Marketing Strategy',
  'credit analysis': 'Credit Risk Analysis',
  'risk analysis': 'Credit Risk Analysis',
  underwriting: 'Credit Risk Analysis',
  'credit operations': 'Credit Risk Analysis',
  'credit risk management': 'Credit Risk Analysis',
  'internal audit': 'Audit & Internal Controls',
  auditing: 'Audit & Internal Controls',
  'internal controls': 'Audit & Internal Controls',
  compliance: 'Regulatory Compliance',
  'regulatory affairs': 'Regulatory Compliance',
  kyc: 'Regulatory Compliance',
  'aml compliance': 'Regulatory Compliance',
  'accounts payable': 'Accounts Payable/Receivable (AR/AP)',
  'accounts receivable': 'Accounts Payable/Receivable (AR/AP)',
  'ar/ap': 'Accounts Payable/Receivable (AR/AP)',
  'cash management': 'Treasury Management',
  rtgs: 'Payments & Settlements Operations',
  'payments processing': 'Payments & Settlements Operations',
  'settlement operations': 'Payments & Settlements Operations',
  'collections management': 'Delinquency & Collections Management',
  'debt collection': 'Delinquency & Collections Management',
  'delinquency tracking': 'Delinquency & Collections Management',
  'mis': 'MIS Reporting',
  'management information systems reporting': 'MIS Reporting',
  'investment banking': 'Investment Analysis',
  'portfolio analysis': 'Investment Analysis',
  'fp&a': 'Financial Planning & Analysis (FP&A)',
  'financial planning and analysis': 'Financial Planning & Analysis (FP&A)',

  // Legal
  'legal drafting': 'Contract Drafting & Review',
  'contract review': 'Contract Drafting & Review',
  'contract management': 'Contract Drafting & Review',
  'commercial law': 'Corporate Law',
  'company law': 'Corporate Law',
  'ip law': 'Intellectual Property (IP) Law',
  'intellectual property': 'Intellectual Property (IP) Law',
  'patent law': 'Intellectual Property (IP) Law',
  litigation: 'Litigation & Dispute Resolution',
  'dispute resolution': 'Litigation & Dispute Resolution',
  arbitration: 'Litigation & Dispute Resolution',

  // Architecture & built environment
  'autocad drafting': 'AutoCAD',
  cad: 'AutoCAD',
  bim: 'Building Information Modeling (BIM)',
  'architectural drafting': 'Architectural Design',
  'building design': 'Architectural Design',
  'town planning': 'Urban Planning',
  'structural engineering': 'Structural Design',

  // Engineering (non-software)
  'civil engineering design': 'Civil Engineering',
  'electrical design': 'Electrical Engineering',
  'mechanical design': 'Mechanical Engineering',
  'quality assurance': 'Quality Assurance (QA) Engineering',
  'quality control': 'Quality Assurance (QA) Engineering',
  'process engineering': 'Manufacturing & Process Engineering',
  manufacturing: 'Manufacturing & Process Engineering',

  // Education & teaching
  'lesson planning and delivery': 'Lesson Planning',
  'curriculum design': 'Curriculum Development',
  'curriculum planning': 'Curriculum Development',
  pedagogy: 'Curriculum Development',
  'classroom instruction': 'Classroom Management',
  teaching: 'Classroom Management',
  'student assessment': 'Student Assessment & Evaluation',
  'grading and assessment': 'Student Assessment & Evaluation',
  igcse: 'Curriculum Development',
  'special needs education': 'Special Education',
  sen: 'Special Education',

  // Healthcare & medicine
  'patient management': 'Patient Care',
  'clinical care': 'Patient Care',
  diagnosis: 'Clinical Diagnosis',
  'ehr systems': 'Electronic Health Records (EHR)',
  'electronic medical records': 'Electronic Health Records (EHR)',
  emr: 'Electronic Health Records (EHR)',
  'medical documentation': 'Clinical Documentation',
  'emergency care': 'Emergency Medicine',
  'er medicine': 'Emergency Medicine',

  // Research & academia
  'academic writing': 'Academic Publishing',
  'peer review': 'Academic Publishing',
  'peer-reviewed publishing': 'Academic Publishing',
  'research methodology': 'Academic Research',
  'lab research': 'Laboratory Research',
  'field research': 'Qualitative Research',
  'survey research': 'Quantitative Research',
  statistics: 'Statistical Analysis',
  spss: 'Statistical Analysis',
  'r programming': 'Statistical Analysis',

  // Analyst / business analysis
  'business requirements': 'Requirements Gathering',
  'requirements analysis': 'Requirements Gathering',
  'business process analysis': 'Business Analysis',

  // Sales, marketing, advertising & social media
  'social media marketing': 'Social Media Management',
  'social media': 'Social Media Management',
  'instagram marketing': 'Social Media Management',
  'content calendar': 'Social Media Strategy',
  'paid media': 'Digital Advertising (PPC/Paid Media)',
  ppc: 'Digital Advertising (PPC/Paid Media)',
  'google ads': 'Digital Advertising (PPC/Paid Media)',
  'facebook ads': 'Digital Advertising (PPC/Paid Media)',
  'meta ads': 'Digital Advertising (PPC/Paid Media)',
  advertising: 'Digital Advertising (PPC/Paid Media)',
  'ad campaigns': 'Digital Advertising (PPC/Paid Media)',
  'brand strategy': 'Brand Management',
  branding: 'Brand Management',
  'email campaigns': 'Email Marketing',
  'newsletter marketing': 'Email Marketing',
  'community engagement': 'Community Management',
  'influencer partnerships': 'Influencer Marketing',
  'marketing performance analysis': 'Marketing Analytics',
  'ad copy': 'Copywriting',
  'sales support': 'Sales Operations',
  'key account management': 'Account Management',
  'client management': 'Account Management',
};

// Whole-word/whole-phrase substring check: the match must not be immediately
// preceded or followed by another letter/digit, so canonical names like
// "Excel" don't fire on "excellent" or "SQL" on "MySQL".
function containsTerm(lowerText: string, term: string): boolean {
  const lowerTerm = term.toLowerCase();
  if (!lowerTerm) return false;

  const isWordChar = (ch: string) => /[a-z0-9]/i.test(ch);
  let fromIndex = 0;
  while (true) {
    const idx = lowerText.indexOf(lowerTerm, fromIndex);
    if (idx === -1) return false;

    const before = idx === 0 ? '' : lowerText[idx - 1];
    const after = idx + lowerTerm.length >= lowerText.length ? '' : lowerText[idx + lowerTerm.length];
    if (!isWordChar(before) && !isWordChar(after)) {
      return true;
    }
    fromIndex = idx + 1;
  }
}

// Common short connector words that don't carry skill-identifying meaning on
// their own — excluded from the token/fuzzy pass below so e.g. "of" or "and"
// never has to appear near another token to count as a match, and never
// counts as a token in its own right.
const FUZZY_STOPWORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'on', 'with', 'a', 'an']);

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !FUZZY_STOPWORDS.has(token));
}

// Whole-word occurrence indices of `term` within `lowerText` — same
// word-boundary rule as containsTerm(), but returns positions instead of a
// boolean so proximity between two different terms can be checked.
function wholeWordIndices(lowerText: string, term: string): number[] {
  const indices: number[] = [];
  if (!term) return indices;

  const isWordChar = (ch: string) => /[a-z0-9]/i.test(ch);
  let fromIndex = 0;
  while (true) {
    const idx = lowerText.indexOf(term, fromIndex);
    if (idx === -1) return indices;

    const before = idx === 0 ? '' : lowerText[idx - 1];
    const after = idx + term.length >= lowerText.length ? '' : lowerText[idx + term.length];
    if (!isWordChar(before) && !isWordChar(after)) {
      indices.push(idx);
    }
    fromIndex = idx + 1;
  }
}

// General token/fuzzy fallback for multi-word skill names: rather than
// requiring the exact phrase verbatim (containsTerm above), this only
// requires every significant word of the skill's name to appear, as whole
// words, within a bounded window of each other somewhere in the text — e.g.
// "Data Analysis" still matches text that reads "...data-driven analysis of
// sales trends...", or where the source text has separated the two words
// with something in between. Applies uniformly to every multi-word skill in
// the taxonomy (technical and business alike) — not specific to any
// particular skill. Single-word skill names are skipped here since exact
// whole-word matching (containsTerm) already handles them with no added
// false-positive risk.
const FUZZY_WINDOW = 60;

function fuzzyMatchesNearby(lowerText: string, tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  const [anchor, ...rest] = tokens;
  const anchorIndices = wholeWordIndices(lowerText, anchor);

  for (const idx of anchorIndices) {
    const windowStart = Math.max(0, idx - FUZZY_WINDOW);
    const windowEnd = Math.min(lowerText.length, idx + anchor.length + FUZZY_WINDOW);
    const window = lowerText.slice(windowStart, windowEnd);
    if (rest.every((token) => wholeWordIndices(window, token).length > 0)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects taxonomy skills (by exact name, alias, or fuzzy nearby-token
 * match) in `text`, plus any additional phrase the text itself explicitly
 * labeled as a skill/requirement (extractListedSkillPhrases above) —
 * canonicalized onto the taxonomy where possible, preserved as a
 * general-category unknown skill otherwise. Used identically for resume
 * text (resumeParserService.ts) and job-listing text (jobService.ts /
 * jobAggregatorService.ts) — the same aliases and matching rules apply to
 * both, so neither is a weaker version of the other.
 */
export function detectSkills(text: string): Skill[] {
  const lowerText = text.toLowerCase();
  const allSkills = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];
  const matched: Skill[] = [];
  const seen = new Set<string>();

  for (const skill of allSkills) {
    if (containsTerm(lowerText, skill.name)) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  for (const [alias, canonicalName] of Object.entries(SKILL_ALIASES)) {
    if (seen.has(canonicalName.toLowerCase())) continue;
    if (!containsTerm(lowerText, alias)) continue;

    const skill = allSkills.find((candidate) => candidate.name === canonicalName);
    if (skill) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  for (const skill of allSkills) {
    if (seen.has(skill.name.toLowerCase())) continue;
    const tokens = significantTokens(skill.name);
    if (fuzzyMatchesNearby(lowerText, tokens)) {
      seen.add(skill.name.toLowerCase());
      matched.push(skill);
    }
  }

  // Preserve skills mentioned in an explicit Skills/Requirements-style
  // section that the taxonomy-matching passes above didn't catch, instead
  // of silently discarding them. Still canonicalizes onto the taxonomy
  // first (by exact name or alias) so a differently-cased or aliased known
  // skill doesn't become a duplicate.
  for (const phrase of extractListedSkillPhrases(text)) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;

    const canonicalName = allSkills.find((skill) => skill.name.toLowerCase() === key)?.name ?? SKILL_ALIASES[key];
    const canonical = canonicalName ? allSkills.find((skill) => skill.name === canonicalName) : undefined;
    if (canonical) {
      if (seen.has(canonical.name.toLowerCase())) continue;
      seen.add(canonical.name.toLowerCase());
      matched.push(canonical);
      continue;
    }

    seen.add(key);
    matched.push(buildUnknownSkill(phrase));
  }

  return matched;
}
