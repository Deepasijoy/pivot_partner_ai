import type { ResumeProfile, Skill } from '../types';
import { mockSkillTaxonomy } from './mockData';

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];
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
    throw new Error('Unsupported file type. Please upload a PDF, DOC, DOCX, or TXT file.');
  }

  const [text] = await Promise.all([readFileAsText(file), delay(PARSE_DELAY_MS)]);
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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read the resume file.'));
    reader.readAsText(file);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSkills(lowerText: string): Skill[] {
  const allSkills = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];
  return allSkills.filter((skill) => lowerText.includes(skill.name.toLowerCase()));
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