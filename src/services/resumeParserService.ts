import type { ResumeProfile, Skill } from '../types';
import { mockSkillTaxonomy } from './mockData';
// Vite resolves this to the built worker file's URL at build time — no
// vite.config.ts change needed, `?url` asset imports work out of the box.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// PDF only — legacy .doc (proprietary binary format) has no reliable
// client-side extraction library, and .docx/.txt support was dropped from
// this pass's scope. Uploading anything else is rejected with a clear
// error rather than attempted.
const ACCEPTED_EXTENSIONS = ['.pdf'];
const PARSE_DELAY_MS = 1200;

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
};

export async function parseResume(file: File): Promise<ResumeProfile> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error('Unsupported file type. Please upload a PDF file.');
  }

  const [text] = await Promise.all([extractPdfText(file), delay(PARSE_DELAY_MS)]);
  const lowerText = text.toLowerCase();

  const skills = detectSkills(lowerText);
  const yearsExperience = detectYearsExperience(text);
  const industries = detectIndustries(lowerText);
  const seniority = detectSeniority(yearsExperience);

  return {
    skills,
    experience: buildExperienceSummary(skills, yearsExperience),
    yearsExperience,
    industries,
    seniority,
  };
}

// Extracts the real text layer from a PDF, page by page in document order,
// via pdfjs-dist — replaces the previous FileReader.readAsText() call,
// which read PDFs as raw binary-decoded-as-text and produced unreadable
// content. Everything downstream (detectSkills, detectIndustries, etc.) is
// unchanged — it just now receives the resume's actual text.
async function extractPdfText(file: File): Promise<string> {
  // Dynamically imported so the (fairly large) pdf.js library only loads
  // into the browser when a user actually uploads a resume, not on initial
  // app load.
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(assembleReadableText(content.items));
  }

  return pageTexts.join('\n');
}

interface PositionedTextItem {
  str: string;
  transform: number[];
}

// Two same-row items rarely differ in y by more than this in unscaled PDF
// space (sub-pixel baseline jitter); a genuinely different line is almost
// always a much larger jump (at least a font-size's worth of units). Kept
// small and conservative — the safer failure mode is treating two rows as
// separate when they were actually one, not merging unrelated rows together.
const LINE_Y_TOLERANCE = 2;

// Reassembles a page's text using pdf.js's own per-item position metadata
// instead of naively concatenating items in raw content-stream order. Two
// narrowly-scoped corrections only:
//  1. Items are clustered into "rows" purely by y-position (within
//     LINE_Y_TOLERANCE) — not by stream order or pdf.js's hasEOL flag, since
//     testing showed hasEOL can fire mid-row for a wrapped block positioned
//     alongside repositioned single-word items (e.g. a sidebar/skill-chip
//     column interleaved with a wrapped paragraph on the same visual line),
//     which would otherwise split same-row content apart. Rows are then
//     emitted in the order their first item appeared in the stream, so
//     overall document flow is preserved.
//  2. Within each row, items are sorted left-to-right by x — this fixes
//     cases where a row's items arrive out of horizontal order in the
//     content stream (common with sidebar/skill-chip layouts), without
//     reordering or merging separate rows or columns.
// Rows are joined with a newline (not a single space), so an unrelated
// adjacent row can't silently read as a continuation of the same phrase.
// Deliberately does NOT attempt column detection or full reading-order
// inference — for an ordinary single-column resume, every line has a
// distinct y (no two lines cluster together), so each becomes its own row
// in original order, and within-row sorting is a no-op on already-ordered
// text — i.e. no change beyond newlines replacing spaces at line breaks.
function assembleReadableText(items: unknown[]): string {
  const rows: { y: number; items: PositionedTextItem[]; firstIndex: number }[] = [];

  let index = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw) || !('transform' in raw)) continue;
    const item = raw as PositionedTextItem;
    const y = item.transform[5];

    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y, items: [], firstIndex: index };
      rows.push(row);
    }
    row.items.push(item);
    index += 1;
  }

  return [...rows]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((row) =>
      [...row.items]
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length > 0)
    .join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Free-text phrasing that commonly shows up in resumes but doesn't literally
// match a taxonomy skill name. Every value here must be an exact taxonomy
// skill name — this only maps wording onto existing skills, it never invents
// new ones. Adapted from server/utils/skillNormalization.ts's ALIAS_MAP.
const SKILL_ALIASES: Record<string, string> = {
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
  'credit analysis': 'Financial Analysis',
  'risk analysis': 'Financial Analysis',
  underwriting: 'Financial Analysis',
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
// sales trends...", or where PDF extraction has separated the two words
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

function detectSkills(lowerText: string): Skill[] {
  const allSkills = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];
  const matched: Skill[] = [];
  const seen = new Set<string>();

  for (const skill of allSkills) {
    if (containsTerm(lowerText, skill.name)) {
      seen.add(skill.name);
      matched.push(skill);
    }
  }

  for (const [alias, canonicalName] of Object.entries(SKILL_ALIASES)) {
    if (seen.has(canonicalName)) continue;
    if (!containsTerm(lowerText, alias)) continue;

    const skill = allSkills.find((candidate) => candidate.name === canonicalName);
    if (skill) {
      seen.add(skill.name);
      matched.push(skill);
    }
  }

  for (const skill of allSkills) {
    if (seen.has(skill.name)) continue;
    const tokens = significantTokens(skill.name);
    if (fuzzyMatchesNearby(lowerText, tokens)) {
      seen.add(skill.name);
      matched.push(skill);
    }
  }

  return matched;
}

function detectYearsExperience(text: string): number {
  const match = text.match(/(\d+)\+?\s*years?/i);
  return match ? parseInt(match[1], 10) : 3;
}

function detectIndustries(lowerText: string): string[] {
  const found = new Set<string>();
  for (const [keyword, label] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      found.add(label);
    }
  }
  return found.size > 0 ? Array.from(found) : ['General Business'];
}

function detectSeniority(yearsExperience: number): string {
  if (yearsExperience < 2) {
    return 'Entry-level';
  } else if (yearsExperience < 5) {
    return 'Mid-level';
  } else if (yearsExperience < 10) {
    return 'Senior';
  } else {
    return 'Lead/Principal';
  }
}

function buildExperienceSummary(skills: Skill[], yearsExperience: number): string {
  if (skills.length === 0) {
    return `${yearsExperience} years of professional experience.`;
  }
  const topSkills = skills.slice(0, 3).map((skill) => skill.name).join(', ');
  return `${yearsExperience} years of experience with a focus on ${topSkills}.`;
}