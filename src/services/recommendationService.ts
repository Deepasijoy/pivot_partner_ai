import type { ResumeProfile, Skill, JobOpportunity, CareerRecommendation } from '../types';
import { mockRemoteJobs, mockFreelanceGigs } from './mockData';

// ---------------------------------------------------------------------------
// Scoring weights — transparent, deterministic, no random inputs.
// ---------------------------------------------------------------------------

const WEIGHT_SKILL_MATCH = 0.5;
const WEIGHT_EXPERIENCE = 0.2;
const WEIGHT_INDUSTRY = 0.15;
const WEIGHT_TRANSFERABLE = 0.15;

// Industry a company is known for. Used only to score industry relevance —
// does not modify JobOpportunity or add fields to existing types.
const COMPANY_INDUSTRY: Record<string, string> = {
  Stripe: 'Fintech',
  Wise: 'Fintech',
  GitLab: 'SaaS',
  Figma: 'SaaS',
  Notion: 'SaaS',
  Shopify: 'E-commerce',
  Zapier: 'SaaS',
  HubSpot: 'SaaS',
  Buffer: 'SaaS',
  'Remote.com': 'SaaS',
  Automattic: 'SaaS',
};

function hasSkillByName(skills: Skill[], name: string): boolean {
  return skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase());
}

function sharedSkillCount(a: Skill[], b: Skill[]): number {
  const bNames = new Set(b.map((skill) => skill.name.toLowerCase()));
  return a.filter((skill) => bNames.has(skill.name.toLowerCase())).length;
}

function seniorityRangeForTitle(title: string): [number, number] {
  const lowerTitle = title.toLowerCase();
  if (/(senior|lead|principal|director|head)/.test(lowerTitle)) return [6, 15];
  if (/manager/.test(lowerTitle)) return [4, 12];
  return [1, 8];
}

export function deriveSeniority(yearsExperience: number): string {
  if (yearsExperience >= 10) return 'Principal / Lead';
  if (yearsExperience >= 6) return 'Senior';
  if (yearsExperience >= 3) return 'Mid-level';
  if (yearsExperience >= 1) return 'Junior';
  return 'Entry-level';
}

export function splitSkillsByTransferability(skills: Skill[]): { coreSkills: Skill[]; transferableSkills: Skill[] } {
  return {
    coreSkills: skills.filter((skill) => skill.category === 'technical'),
    transferableSkills: skills.filter((skill) => skill.category === 'business'),
  };
}

interface JobScore {
  matchScore: number;
  skillMatchPercent: number;
  experienceScore: number;
  industryScore: number;
  transferableScore: number;
  industry: string;
  matchedSkills: Skill[];
  missingSkills: Skill[];
  matchedBusinessSkills: Skill[];
}

function scoreJob(profile: ResumeProfile, job: JobOpportunity): JobScore {
  const matchedSkills = job.requiredSkills.filter((skill) => hasSkillByName(profile.skills, skill.name));
  const missingSkills = job.requiredSkills.filter((skill) => !hasSkillByName(profile.skills, skill.name));
  const skillMatchPercent = job.requiredSkills.length > 0 ? (matchedSkills.length / job.requiredSkills.length) * 100 : 0;

  const [idealMin, idealMax] = seniorityRangeForTitle(job.title);
  let experienceScore: number;
  if (profile.yearsExperience >= idealMin && profile.yearsExperience <= idealMax) {
    experienceScore = 100;
  } else {
    const distance =
      profile.yearsExperience < idealMin ? idealMin - profile.yearsExperience : profile.yearsExperience - idealMax;
    experienceScore = Math.max(0, 100 - distance * 15);
  }

  const industry = COMPANY_INDUSTRY[job.company] ?? 'General Business';
  const userIndustriesLower = profile.industries.map((i) => i.toLowerCase());
  let industryScore: number;
  if (userIndustriesLower.includes(industry.toLowerCase())) {
    industryScore = 100;
  } else if (userIndustriesLower.length === 0 || userIndustriesLower.includes('general business')) {
    industryScore = 50;
  } else {
    industryScore = 20;
  }

  const businessRequired = job.requiredSkills.filter((skill) => skill.category === 'business');
  const matchedBusinessSkills = businessRequired.filter((skill) => hasSkillByName(profile.skills, skill.name));
  const transferableScore =
    businessRequired.length === 0 ? 50 : (matchedBusinessSkills.length / businessRequired.length) * 100;

  const matchScore = Math.round(
    skillMatchPercent * WEIGHT_SKILL_MATCH +
      experienceScore * WEIGHT_EXPERIENCE +
      industryScore * WEIGHT_INDUSTRY +
      transferableScore * WEIGHT_TRANSFERABLE
  );

  return {
    matchScore,
    skillMatchPercent,
    experienceScore,
    industryScore,
    transferableScore,
    industry,
    matchedSkills,
    missingSkills,
    matchedBusinessSkills,
  };
}

function buildReasons(profile: ResumeProfile, score: JobScore): string {
  const reasons: string[] = [];

  if (score.skillMatchPercent >= 60 && score.matchedSkills.length > 0) {
    const topNames = score.matchedSkills.slice(0, 3).map((skill) => skill.name).join(', ');
    reasons.push(`Strong overlap in ${topNames}`);
  }

  if (score.experienceScore >= 70) {
    reasons.push(`Your ${profile.yearsExperience} years of experience matches this role's seniority`);
  }

  if (score.industryScore >= 100) {
    reasons.push(`Direct experience in ${score.industry}`);
  }

  if (score.transferableScore >= 70 && score.matchedBusinessSkills.length > 0) {
    const names = score.matchedBusinessSkills.slice(0, 2).map((skill) => skill.name).join(', ');
    reasons.push(`${names} carr${score.matchedBusinessSkills.length === 1 ? 'ies' : 'y'} over directly`);
  }

  if (reasons.length === 0) {
    reasons.push('A growth opportunity to build in-demand skills in a new field');
  }

  return reasons.slice(0, 3).join('\n');
}

function buildRecommendedAction(matchScore: number, missingSkills: Skill[], company: string): string {
  const weightedGap = missingSkills.reduce((sum, skill) => {
    if (skill.demandLevel === 'very_high') return sum + 3;
    if (skill.demandLevel === 'high') return sum + 2;
    return sum + 1;
  }, 0);
  const missingNames = missingSkills.slice(0, 2).map((skill) => skill.name).join(', ');

  if (matchScore >= 75 && weightedGap <= 2) {
    return missingSkills.length > 0
      ? `Apply now + close ${missingNames} gap`
      : `Apply now — you meet this role's requirements at ${company}`;
  }

  if (matchScore >= 45 || weightedGap <= 5) {
    return `Apply + targeted learning in ${missingNames || 'a few key areas'}`;
  }

  return `Learning-first: build ${missingNames || 'core skills for this role'} before applying`;
}

function computeOpportunityCount(job: JobOpportunity, jobs: JobOpportunity[]): number {
  const similarJobs = jobs.filter(
    (candidate) => candidate.id !== job.id && sharedSkillCount(candidate.requiredSkills, job.requiredSkills) >= 1
  ).length;
  const similarGigs = mockFreelanceGigs.filter(
    (gig) => sharedSkillCount(gig.requiredSkills, job.requiredSkills) >= 1
  ).length;
  return similarJobs + similarGigs + 1;
}

export interface CareerRecommendationOptions {
  limit?: number;
  jobs?: JobOpportunity[];
}

export function getCareerRecommendations(
  profile: ResumeProfile,
  options?: CareerRecommendationOptions
): CareerRecommendation[] {
  const jobs = options?.jobs ?? mockRemoteJobs;
  const limit = options?.limit ?? 5;

  const scored: CareerRecommendation[] = jobs.map((job) => {
    const score = scoreJob(profile, job);

    return {
      id: `rec_${job.id}`,
      title: `Remote ${job.title}`,
      matchScore: score.matchScore,
      reason: buildReasons(profile, score),
      salaryRange: job.salaryRange,
      opportunityCount: computeOpportunityCount(job, jobs),
      missingSkills: score.missingSkills,
      matchedSkills: score.matchedSkills,
      recommendedAction: buildRecommendedAction(score.matchScore, score.missingSkills, job.company),
    };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
}
