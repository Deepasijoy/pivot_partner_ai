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

  return {
    skills,
    experience: buildExperienceSummary(skills, yearsExperience),
    yearsExperience,
    industries,
    seniority,
    likelyRole,
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
// Title:", "Position:", anywhere in the document.
const TITLE_LABEL_PATTERN = /^(?:current\s+)?(?:job\s+)?(?:title|role|position)\s*:\s*(.+)$/i;

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

  for (const line of lines) {
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