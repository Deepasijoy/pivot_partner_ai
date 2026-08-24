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
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n');
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
  databases: 'SQL',
  'power bi dashboards': 'Power BI',
  'data visualization': 'Tableau',
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