import type { Skill } from '../../src/types';
import { mockSkillTaxonomy } from '../../src/services/mockData';
import { normalizeSkills as exactMatchSkills } from '../../src/services/skillAnalysisService';

// Free-text phrasing that commonly shows up in resumes/Claude output but
// doesn't literally match a taxonomy skill name.
const ALIAS_MAP: Record<string, string> = {
  'financial reporting': 'Financial Analysis',
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

const ALL_TAXONOMY_SKILLS: Skill[] = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];

function findByCanonicalName(name: string): Skill | undefined {
  return ALL_TAXONOMY_SKILLS.find((skill) => skill.name.toLowerCase() === name.toLowerCase());
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function fuzzyMatch(rawSkill: string): Skill | undefined {
  let best: { skill: Skill; score: number } | undefined;
  for (const skill of ALL_TAXONOMY_SKILLS) {
    const score = tokenOverlapScore(rawSkill, skill.name);
    if (score > 0.5 && (!best || score > best.score)) {
      best = { skill, score };
    }
  }
  return best?.skill;
}

/**
 * Maps free-text skill strings (e.g. from Claude's resume extraction) onto
 * the project's controlled skill taxonomy. Anything that can't be matched
 * with reasonable confidence is dropped rather than invented as a new skill.
 */
export function normalizeSkillsAgainstTaxonomy(rawSkillNames: string[]): Skill[] {
  const matched: Skill[] = [];
  const seen = new Set<string>();

  for (const raw of rawSkillNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let skill: Skill | undefined = exactMatchSkills([trimmed])[0];

    if (!skill) {
      const alias = ALIAS_MAP[trimmed.toLowerCase()];
      if (alias) skill = findByCanonicalName(alias);
    }

    if (!skill) {
      skill = fuzzyMatch(trimmed);
    }

    if (skill && !seen.has(skill.name)) {
      seen.add(skill.name);
      matched.push(skill);
    }
  }

  return matched;
}
