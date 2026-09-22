import type { ResumeProfile, Skill } from '../types';
import { detectSkills } from './skillExtractionService';
import { detectIndustries } from './industryDetectionService';
// Vite resolves this to the built worker file's URL at build time — no
// vite.config.ts change needed, `?url` asset imports work out of the box.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// PDF only — legacy .doc (proprietary binary format) has no reliable
// client-side extraction library, and .docx/.txt support was dropped from
// this pass's scope. Uploading anything else is rejected with a clear
// error rather than attempted.
const ACCEPTED_EXTENSIONS = ['.pdf'];
const PARSE_DELAY_MS = 1200;

export async function parseResume(file: File): Promise<ResumeProfile> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error('Unsupported file type. Please upload a PDF file.');
  }

  const [text] = await Promise.all([extractPdfText(file), delay(PARSE_DELAY_MS)]);

  const skills = detectSkills(text);
  const yearsExperience = detectYearsExperience(text);
  const industries = detectIndustries(text);
  const seniority = detectSeniority(yearsExperience);
  const likelyRole = detectLikelyRole(text);
  const lowConfidenceSkillNames = computeLowConfidenceSkillNames(text, skills);
  const highConfidenceSkillNames = computeHighConfidenceSkillNames(text, skills);

  return {
    skills,
    experience: buildExperienceSummary(skills, yearsExperience),
    yearsExperience,
    industries,
    seniority,
    likelyRole,
    lowConfidenceSkillNames,
    highConfidenceSkillNames,
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

function detectYearsExperience(text: string): number {
  const match = text.match(/(\d+)\+?\s*years?/i);
  return match ? parseInt(match[1], 10) : 3;
}

// Structural formatting words, not occupations — used only to reject a
// line that's clearly a resume section header rather than a job title
// (e.g. if line 2 happens to be "Skills" because there was no name line).
const NON_TITLE_LINE_WORDS = new Set([
  'skills', 'experience', 'education', 'summary', 'objective', 'contact',
  'references', 'certifications', 'projects', 'publications', 'awards',
  'profile', 'about', 'employment', 'history', 'qualifications',
]);

// Explicit label wins over everything — the resume is telling us directly
// what to call this. Matches "Title:", "Role:", "Current Role:", "Job
// Title:", "Position:", but only within a section where that label
// actually describes the candidate's own professional identity — see
// isSectionHeaderLine() below and its use in detectLikelyRole().
const TITLE_LABEL_PATTERN = /^(?:current\s+)?(?:job\s+)?(?:title|role|position)\s*:\s*(.+)$/i;

// Section headers where a "Title:"/"Role:"/"Position:" label genuinely
// names the candidate's own job.
const EXPERIENCE_SECTION_HEADERS =
  /^(?:professional\s+|work\s+)?experience$|^employment(?:\s+history)?$|^work\s+history$|^career\s+history$/i;

// Side/personal project sections specifically — split out from the broader
// NON_EXPERIENCE_SECTION_HEADERS set below (which it's still part of, via
// composition) so it can also be recognized on its own by
// splitOutSideProjectSections() further down, for skill-cluster weighting.
const SIDE_PROJECT_SECTION_HEADERS = /^(?:side|independent|personal|academic|open[\s-]source)\s+projects?$|^projects?$/i;

// Key-Skills/Skills-Summary section headers — also split out on its own
// (same reason as SIDE_PROJECT_SECTION_HEADERS above) so
// splitOutKeySkillsSection() further down can recognize it independently,
// for the opposite purpose: skills stated here are a deliberate self-
// declaration, higher-confidence evidence than an incidental in-bullet
// mention, not lower — see jobQueryService.ts's KEY_SKILLS_SKILL_WEIGHT.
// Broader than a single "Skills" entry on purpose: real resumes use varied
// wording for the same convention ("Key Skills", "Skills Summary", "Core
// Competencies", "Areas of Expertise", "Skill Set", "Technical
// Proficiencies", ...) — validated against this specific variety, not just
// one phrasing, before being wired into any weighting decision.
const KEY_SKILLS_SECTION_HEADERS =
  /^(?:key|core|technical|professional|primary|relevant)?\s*skills?(?:\s*(?:&|and)\s*(?:expertise|competencies))?$|^skills?\s*(?:summary|overview|profile)$|^core\s+competenc(?:y|ies)$|^competenc(?:y|ies)$|^areas?\s+of\s+expertise$|^expertise$|^skill\s*set$|^technical\s+proficienc(?:y|ies)$/i;

// Section headers where a "Title:"/"Role:"/"Position:" label describes
// something else entirely — a side/personal project's role, not the
// candidate's own job — and must never be trusted as their professional
// identity no matter how confident the line itself looks (this is exactly
// what let a "Role: Full Stack Developer" line inside a "Side Projects"
// section hijack a BI/finance candidate's likelyRole, and from there their
// job search query and occupation resolution, in a real, reproduced case).
const NON_EXPERIENCE_SECTION_HEADERS = new RegExp(
  `${SIDE_PROJECT_SECTION_HEADERS.source}|${KEY_SKILLS_SECTION_HEADERS.source}|^education$|^certifications?$|^publications?$|^awards?(?:\\s+(?:&|and)\\s+honou?rs?)?$|^references?$|^summary$|^objective$|^profile$|^about(?:\\s+me)?$`,
  'i'
);

// A structural, non-vocabulary signal for "this line is very likely SOME
// section heading, even if we don't recognize which one" — the same pattern
// skillExtractionService.ts's GENERIC_SECTION_HEADER_LINE_PATTERN already
// uses, for the same reason: a fixed word list can never cover every
// resume's actual heading wording ("Publications:", "Volunteer Work:",
// "Certifications & Licenses:", ...). Deliberately colon-anchored, not just
// "short and title-case" — a bare company name or job title on its own line
// ("National Trust Bank", "Senior Credit Operations Officer") is exactly as
// short/title-cased as a real heading, so anything looser here would wrongly
// swallow the very title lines detectLikelyRole() exists to find.
const GENERIC_HEADING_LINE_PATTERN = /^[A-Za-z][A-Za-z /&-]{0,38}:$/;

// Classifies a line as a recognized "experience" header, a recognized
// "side-project" header, a recognized "key-skills" header (each a
// NON_EXPERIENCE_SECTION_HEADERS subset, called out on its own so
// splitOutSideProjectSections()/splitOutKeySkillsSection() below can track
// them independently — a Skills/Key-Skills/Certifications section is
// exactly the kind of real, earned-skill evidence the side-project
// mechanism must NOT down-weight, and a Key-Skills section specifically is
// exactly what the high-confidence mechanism must isolate), any other
// recognized "non-experience" header, an unrecognized-but-heading-shaped
// line, or null (ordinary content). A recognized heading sets eligibility
// explicitly (true/false) in detectLikelyRole(). An unrecognized heading —
// real, since only a handful of common phrasings are hardcoded — FAILS
// CLOSED there: it's treated as non-experience rather than leaving
// eligibility unchanged, because the cost of missing a genuine title
// (silently falls through to the line-2 heuristic, today's existing
// behavior) is far lower than the cost of wrongly trusting a label under a
// heading we simply didn't recognize (this is the exact original bug this
// function exists to close). Only a line with NO heading signal at all —
// ordinary prose, a company name, a bare title — leaves eligibility
// unchanged, since those are exactly the lines this function must not
// misfire on (see GENERIC_HEADING_LINE_PATTERN's own comment).
function isSectionHeaderLine(line: string): 'experience' | 'non-experience' | 'side-project' | 'key-skills' | null {
  const trimmed = line.trim();
  const normalized = trimmed.replace(/:$/, '');
  if (EXPERIENCE_SECTION_HEADERS.test(normalized)) return 'experience';
  if (SIDE_PROJECT_SECTION_HEADERS.test(normalized)) return 'side-project';
  if (KEY_SKILLS_SECTION_HEADERS.test(normalized)) return 'key-skills';
  if (NON_EXPERIENCE_SECTION_HEADERS.test(normalized)) return 'non-experience';
  if (GENERIC_HEADING_LINE_PATTERN.test(trimmed)) return 'non-experience';
  return null;
}

function looksLikeTitleLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  // Digits/@ rule out phone numbers, emails, dates, and "8 years..." lines.
  if (/[@\d]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 6) return false;
  if (NON_TITLE_LINE_WORDS.has(trimmed.toLowerCase().replace(/:$/, ''))) return false;
  return true;
}

// Preserves whatever professional title the resume itself states, rather
// than inferring one from skills — open-ended by construction: never
// matched against a fixed occupation list, so any title (Marine Biologist,
// Journalist, Museum Curator, ...) is captured as-written or not at all.
// Deliberately conservative — when neither signal is confident, returns
// undefined, which is exactly today's (unset) behavior, so this can only
// add information, never regress a case that worked before.
function detectLikelyRole(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  // Section-scoped: a "Title:"/"Role:"/"Position:" label only counts while
  // we're in a section where it actually names the candidate's own job.
  // Starts eligible (true) — the header/contact block at the top of a
  // resume, before any section is declared, is exactly where a real
  // "Title: X" line normally lives. An unrecognized heading leaves the
  // current state unchanged rather than guessing either way.
  let eligible = true;
  for (const line of lines) {
    const section = isSectionHeaderLine(line);
    if (section === 'experience') eligible = true;
    else if (section === 'non-experience' || section === 'side-project' || section === 'key-skills') eligible = false;

    if (!eligible) continue;
    const match = line.match(TITLE_LABEL_PATTERN);
    if (match) {
      const candidate = match[1].trim().replace(/[.,;]+$/, '');
      if (candidate) return candidate;
    }
  }

  // Common convention: name on line 1, title on line 2 — only trusted when
  // it reads like a short title, not a tagline/contact line/section header.
  if (lines.length >= 2 && looksLikeTitleLine(lines[1])) {
    return lines[1];
  }

  return undefined;
}

// Reuses the exact same section-boundary tracking as detectLikelyRole()'s
// eligibility loop — scoped to just "am I inside a recognized Side/
// Personal/Academic/Independent Projects section" — so the two mechanisms
// can never disagree on what counts as one. Only side-project membership is
// tracked (not the full experience/non-experience state machine): a Skills
// or Certifications section is exactly the kind of real, earned-skill
// evidence this must NOT exclude, so nothing but a recognized side-project
// header (or leaving one via any other recognized header) changes state.
function splitOutSideProjectSections(text: string): { mainText: string } {
  const lines = text.split('\n');
  const mainLines: string[] = [];
  let inSideProject = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      const section = isSectionHeaderLine(line);
      if (section === 'side-project') inSideProject = true;
      else if (section === 'experience' || section === 'non-experience' || section === 'key-skills') inSideProject = false;
    }
    if (!inSideProject) mainLines.push(line);
  }

  return { mainText: mainLines.join('\n') };
}

// Same section-boundary tracking as splitOutSideProjectSections() above,
// scoped instead to "am I inside a recognized Key-Skills/Skills-Summary
// section" — isolates just that section's own text so
// computeHighConfidenceSkillNames() below can re-run skill detection on it
// alone, the same technique computeLowConfidenceSkillNames() uses for side
// projects.
function splitOutKeySkillsSection(text: string): { keySkillsText: string } {
  const lines = text.split('\n');
  const keySkillsLines: string[] = [];
  let inKeySkills = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      const section = isSectionHeaderLine(line);
      if (section === 'key-skills') inKeySkills = true;
      else if (section === 'experience' || section === 'non-experience' || section === 'side-project') inKeySkills = false;
    }
    if (inKeySkills) keySkillsLines.push(line);
  }

  return { keySkillsText: keySkillsLines.join('\n') };
}

// Names (lowercased) of skills whose textual evidence includes a dedicated
// Key-Skills/Skills-Summary section — a deliberate self-declaration, and so
// HIGHER-confidence evidence than an incidental in-bullet mention, the
// mirror image of computeLowConfidenceSkillNames() above.
// jobQueryService.ts's findDominantSkillClusters() uses this to boost (see
// its own KEY_SKILLS_SKILL_WEIGHT) these specifically, so a candidate's
// self-declared focus skills carry more weight in cluster-matching than a
// skill mentioned once in passing.
function computeHighConfidenceSkillNames(text: string, allSkills: Skill[]): string[] {
  const { keySkillsText } = splitOutKeySkillsSection(text);
  if (!keySkillsText.trim()) return [];
  const keySkillsOnlyNames = new Set(detectSkills(keySkillsText).map((skill) => skill.name.toLowerCase()));
  return allSkills.map((skill) => skill.name.toLowerCase()).filter((name) => keySkillsOnlyNames.has(name));
}

// Names (lowercased) of skills whose ONLY textual evidence is inside a
// side/personal project section — a genuine skill, but weaker evidence
// than one stated in Professional Experience, a dedicated Skills section,
// or Certifications. jobQueryService.ts's findDominantSkillClusters() uses
// this to down-weight (never zero out) these specifically, so an
// incidental side-project tool mention can't outvote a candidate's actual
// professional or credentialed skillset when deriving a job-search query —
// see its own SIDE_PROJECT_SKILL_WEIGHT for why this matters: a real,
// reproduced case had a side project mentioning 4 different web
// technologies tie (and in one further case, even beat) a candidate's
// actual Power BI/SQL/Python/data-analytics-certificate skillset for
// cluster-matching purposes.
//
// Determined by re-running the SAME skill detector on only the non-side-
// project portion of the text: anything detected there is full-confidence
// (even if it ALSO happens to appear in a side project — genuinely used
// professionally too, so it should count fully); anything that only shows
// up once side-project text is included is side-project-only.
function computeLowConfidenceSkillNames(text: string, allSkills: Skill[]): string[] {
  const { mainText } = splitOutSideProjectSections(text);
  const mainOnlyNames = new Set(detectSkills(mainText).map((skill) => skill.name.toLowerCase()));
  return allSkills.map((skill) => skill.name.toLowerCase()).filter((name) => !mainOnlyNames.has(name));
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