import type { ResumeProfile, Skill, JobOpportunity, CareerRecommendation } from '../types';
import { mockRemoteJobs, mockFreelanceGigs } from './mockData';
import { classifyOccupationCompatibility, type OccupationCompatibilityResult } from './occupationMatchingService';
import { getEscoSkillById } from './escoTaxonomyClient';

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

// Matches by ESCO id first (the reliable key once both sides are ESCO-
// sourced), falling back to name equality for a skill that predates ESCO
// extraction (mockData.ts's own mock jobs/gigs) — so neither source
// silently stops matching the other.
function hasMatchingSkill(skills: Skill[], target: Skill): boolean {
  if (target.escoId) {
    if (skills.some((skill) => skill.escoId === target.escoId)) return true;
  }
  return hasSkillByName(skills, target.name);
}

// A job with zero real overlap in its ACTUAL requirements must never read
// as a viable match, regardless of what the raw weighted formula or the
// occupation-family multiplier alone would have produced — this is the
// explicit trust-integrity rule the ESCO migration was built to guarantee:
// same failure shape as the original Power BI/SAP bug (a job the candidate
// shares nothing real with still scoring competitively), now closed at the
// scoring layer itself rather than relying solely on occupation gating to
// catch it. Deliberately below matchFitBand.ts's Stretch/Worth Exploring
// boundary (55).
const ZERO_ESSENTIAL_OVERLAP_CAP = 20;

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

export interface JobScore {
  matchScore: number;
  skillMatchPercent: number;
  experienceScore: number;
  industryScore: number;
  transferableScore: number;
  industry: string;
  matchedSkills: Skill[];
  missingSkills: Skill[];
  matchedBusinessSkills: Skill[];
  // True whenever the effective requirement list (the matched occupation's
  // essential skills, or job.requiredSkills as a fallback when no
  // occupation resolved) is non-empty AND at least one of those skills was
  // actually matched. Used by rankJobs() below to guarantee a zero-overlap
  // job can never rank above one with genuine overlap, regardless of score.
  hasEssentialOverlap: boolean;
  // Exposed for callers that want the reasoning behind a score adjustment
  // (e.g. future explanation work) — never read by buildReasons()/
  // buildRecommendedAction() below today, so it changes no existing
  // wording. See occupationMatchingService.ts.
  occupationCompatibility: OccupationCompatibilityResult;
}

// The occupation-resolved essential skills ARE the requirement list once an
// occupation is known — job.requiredSkills (free-text extraction from the
// listing's own title/description) is only ever a fallback for a job whose
// occupation couldn't be resolved (see occupationMatchingService.ts's
// honesty guarantee: ESCO doesn't have every real-world title, e.g. no
// dedicated "SAP consultant" occupation). Skill gaps must come only from
// this list — never from free-text keywords — per the ESCO migration's
// explicit requirement.
function effectiveRequiredSkills(job: JobOpportunity, compatibility: OccupationCompatibilityResult): Skill[] {
  const essentialIds = compatibility.jobOccupation?.essentialSkillIds;
  if (essentialIds && essentialIds.length > 0) {
    const skills = essentialIds.map((id) => getEscoSkillById(id)).filter((s): s is Skill => Boolean(s));
    if (skills.length > 0) return skills;
  }
  return job.requiredSkills;
}

// Exported so matchingService.ts's matchFreelanceForUser() can score
// freelance gigs through this EXACT same formula/gate — see its own comment
// for why gigs are wrapped into a JobOpportunity shape rather than
// recommendationService.ts gaining a second, parallel formula. Every other
// caller still goes through rankJobsForUser()/getCareerRecommendations()
// below, which remain the single source of truth for job ranking.
export function scoreJob(profile: ResumeProfile, job: JobOpportunity): JobScore {
  // Occupation/role-family compatibility is resolved FIRST — scoring below
  // needs its jobOccupation (for the essential-skills requirement list),
  // not just its multiplier/cap.
  const occupationCompatibility = classifyOccupationCompatibility(
    profile.likelyRole,
    profile.industries,
    job.title,
    job.description,
    profile.skills
  );

  const requiredSkills = effectiveRequiredSkills(job, occupationCompatibility);
  const matchedSkills = requiredSkills.filter((skill) => hasMatchingSkill(profile.skills, skill));
  const missingSkills = requiredSkills.filter((skill) => !hasMatchingSkill(profile.skills, skill));
  const skillMatchPercent = requiredSkills.length > 0 ? (matchedSkills.length / requiredSkills.length) * 100 : 0;
  const hasEssentialOverlap = requiredSkills.length === 0 || matchedSkills.length > 0;

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

  const businessRequired = requiredSkills.filter((skill) => skill.category === 'business');
  const matchedBusinessSkills = businessRequired.filter((skill) => hasMatchingSkill(profile.skills, skill));
  const transferableScore =
    businessRequired.length === 0 ? 50 : (matchedBusinessSkills.length / businessRequired.length) * 100;

  // Unchanged from before this file's occupation-awareness fix — every
  // existing input/weight is exactly as it was.
  const rawScore = Math.round(
    skillMatchPercent * WEIGHT_SKILL_MATCH +
      experienceScore * WEIGHT_EXPERIENCE +
      industryScore * WEIGHT_INDUSTRY +
      transferableScore * WEIGHT_TRANSFERABLE
  );

  // Occupation/family compatibility is a GATE applied to the score above,
  // not a 5th additive weight — an additive term could still let raw
  // skill overlap dominate (e.g. a Marine Biologist matching Python/SQL
  // against a Data Analyst posting), which is exactly the failure this
  // closes. same_domain and candidate-unresolved unknown apply no
  // adjustment at all — a candidate whose occupation can't be determined
  // is never penalized, and the existing skill-based score keeps working
  // exactly as before.
  let matchScore = Math.round(rawScore * occupationCompatibility.multiplier);
  if (occupationCompatibility.cap !== undefined) {
    matchScore = Math.min(matchScore, occupationCompatibility.cap);
  }

  // Trust-integrity floor: zero overlap in the ACTUAL requirement list
  // (essential skills when an occupation resolved, job.requiredSkills
  // otherwise) must never read as Stretch-or-better, regardless of what the
  // weighted formula or occupation multiplier alone produced — this is what
  // makes the "zero real overlap" failure shape structurally impossible,
  // not just statistically unlikely.
  if (!hasEssentialOverlap) {
    matchScore = Math.min(matchScore, ZERO_ESSENTIAL_OVERLAP_CAP);
  }

  matchScore = Math.max(0, Math.min(100, matchScore));

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
    hasEssentialOverlap,
    occupationCompatibility,
  };
}

function buildReasons(profile: ResumeProfile, score: JobScore): string {
  const reasons: string[] = [];

  if (score.skillMatchPercent >= 60 && score.matchedSkills.length > 0) {
    const topNames = score.matchedSkills.slice(0, 3).map((skill) => skill.name).join(', ');
    reasons.push(`Strong overlap in ${topNames}`);
  }

  if (score.experienceScore >= 70) {
    reasons.push(`Your ${profile.yearsExperience} years of overall professional experience aligns with this role's seniority level.`);
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

// Scores and sorts once — both getCareerRecommendations() below and
// rankJobsForUser() build their own output shape from this same ranking, so
// a job's position/score can never drift between the two.
function rankJobs(profile: ResumeProfile, jobs: JobOpportunity[]): { job: JobOpportunity; score: JobScore }[] {
  return jobs
    .map((job) => ({ job, score: scoreJob(profile, job) }))
    .sort((a, b) => {
      // A job with zero overlap in its actual requirements can never
      // outrank one with genuine overlap, regardless of raw score — the
      // "never the top match" guarantee, enforced structurally here rather
      // than relying on the score gap alone.
      if (a.score.hasEssentialOverlap !== b.score.hasEssentialOverlap) {
        return a.score.hasEssentialOverlap ? -1 : 1;
      }
      return b.score.matchScore - a.score.matchScore;
    });
}

// The same scoreJob() ranking getCareerRecommendations() below builds its
// "Recommended Paths" cards from, exposed as plain JobOpportunity[] (matchScore
// + occupationCategory attached, like matchingService.ts's matchJobsForUser)
// instead of the flattened CareerRecommendation summary — so a caller that
// needs actual JobOpportunity objects (e.g. generateCareerPaths()) can reuse
// this exact ranking rather than re-scoring the same jobs with
// matchingService.ts's separate calculateMatchScore formula and getting a
// different score for the same job.
export function rankJobsForUser(profile: ResumeProfile, jobs: JobOpportunity[]): JobOpportunity[] {
  return rankJobs(profile, jobs).map(({ job, score }) => ({
    ...job,
    matchScore: score.matchScore,
    occupationCategory: score.occupationCompatibility.category,
    // Overwritten with the EFFECTIVE requirement list scoreJob() actually
    // scored against (the matched occupation's essential skills, when
    // resolved — see effectiveRequiredSkills()) — never left as the job's
    // original free-text requiredSkills, which a downstream caller (e.g.
    // matchingService.ts's generateCareerPaths -> calculateSkillGaps) would
    // otherwise recompute gaps against, silently disagreeing with what was
    // actually scored.
    requiredSkills: [...score.matchedSkills, ...score.missingSkills],
    matchedSkills: score.matchedSkills,
    missingSkills: score.missingSkills,
  }));
}

export function getCareerRecommendations(
  profile: ResumeProfile,
  options?: CareerRecommendationOptions
): CareerRecommendation[] {
  const jobs = options?.jobs ?? mockRemoteJobs;
  const limit = options?.limit ?? 5;

  const scored: CareerRecommendation[] = rankJobs(profile, jobs).map(({ job, score }) => ({
    id: `rec_${job.id}`,
    title: `Remote ${job.title}`,
    company: job.company,
    workModel: 'remote',
    matchScore: score.matchScore,
    reason: buildReasons(profile, score),
    salaryRange: job.salaryRange,
    opportunityCount: computeOpportunityCount(job, jobs),
    missingSkills: score.missingSkills,
    matchedSkills: score.matchedSkills,
    recommendedAction: buildRecommendedAction(score.matchScore, score.missingSkills, job.company),
    applyUrl: job.applyUrl,
    postedAt: job.postedAt,
    source: job.source,
    occupationCategory: score.occupationCompatibility.category,
  }));

  return scored.slice(0, limit);
}
