import type { ResumeProfile, Skill, JobOpportunity, FreelanceGig, CareerPath, CareerPathDataState, SkillGap } from '../types';
import { mockRemoteJobs, mockFreelanceGigs } from './mockData';
import { calculateSkillGaps } from './skillAnalysisService';
import { scoreJob } from './recommendationService';

// Scores every job through the EXACT same scoreJob() formula/gate
// rankJobsForUser() (recommendationService.ts) uses — not a second,
// parallel implementation — so a job's score can never drift between the
// main Recommended Paths cards and this Career Paths view of the same job.
export function matchJobsForUser(profile: ResumeProfile, jobs: JobOpportunity[] = mockRemoteJobs): JobOpportunity[] {
  return jobs
    .map((job) => {
      const score = scoreJob(profile, job);
      return {
        ...job,
        matchScore: score.matchScore,
        occupationCategory: score.occupationCompatibility.category,
        // See rankJobsForUser()'s identical fix (recommendationService.ts)
        // for why: downstream (generateCareerPaths -> calculateSkillGaps)
        // must see the EFFECTIVE requirement list scoreJob() actually used,
        // not the job's original free-text requiredSkills.
        requiredSkills: [...score.matchedSkills, ...score.missingSkills],
        matchedSkills: score.matchedSkills,
        missingSkills: score.missingSkills,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

// Freelance gigs go through the SAME scorer and bands as job listings — no
// separate formula, no default/hardcoded band. A gig has no company/
// description/salary the way a JobOpportunity does, so it's wrapped into
// that shape (platform standing in for company, budget for salaryRange,
// title-only for description since a gig's real requirements already live
// in requiredSkills) purely so scoreJob() can run unmodified; nothing about
// scoreJob() itself changes for this caller.
function asScorableJobOpportunity(gig: FreelanceGig): JobOpportunity {
  return {
    id: gig.id,
    title: gig.title,
    company: gig.platform,
    salaryRange: gig.budget,
    timezone: 'Freelance',
    matchScore: 0,
    requiredSkills: gig.requiredSkills,
    matchedSkills: [],
    missingSkills: gig.requiredSkills,
    description: gig.title,
    employmentMatch: 0,
  };
}

export function matchFreelanceForUser(
  userSkills: Skill[],
  likelyRole?: string,
  industries?: string[],
  gigs: FreelanceGig[] = mockFreelanceGigs
): FreelanceGig[] {
  const profile: ResumeProfile = { skills: userSkills, experience: '', yearsExperience: 0, industries: industries ?? [], likelyRole };
  return gigs
    .map((gig) => {
      const score = scoreJob(profile, asScorableJobOpportunity(gig));
      return { ...gig, matchPercentage: score.matchScore, occupationCategory: score.occupationCompatibility.category };
    })
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, 3);
}

function hasSkill(skills: Skill[], name: string): boolean {
  return skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase());
}

// Org-context gaps (SkillGap.requiresOrgContext — see skillAnalysisService.ts's
// ORG_CONTEXT_SKILL_IDS) denote organizational scope/authority, not a
// self-study-able ability, so they're excluded from the closable-gap
// names/totalWeeks here and surfaced separately via orgContextNames —
// callers must not fold them into a "spend N weeks closing the gap in X"
// framing.
function describeSkillGaps(skillGaps: SkillGap[]): { names: string; totalWeeks: number; orgContextNames: string[] } {
  const closableGaps = skillGaps.filter((gap) => !gap.requiresOrgContext);
  const names = closableGaps.map((gap) => gap.skill.name).join(', ');
  const totalWeeks = closableGaps.reduce((sum, gap) => sum + gap.estimatedTimeWeeks, 0);
  const orgContextNames = skillGaps.filter((gap) => gap.requiresOrgContext).map((gap) => gap.skill.name);
  return { names, totalWeeks, orgContextNames };
}

function describeOrgContextSkills(orgContextNames: string[]): string {
  const verb = orgContextNames.length === 1 ? 'is' : 'are';
  return `${orgContextNames.join(', ')} ${verb} typically gained on the job rather than beforehand.`;
}

// Three honest states for a job-based Career Path, replacing the previous
// two-branch logic (which keyed only on skillGaps.length) that produced a
// confirmed contradiction: a job with ZERO detected required skills has
// zero skillGaps too (there's nothing to be missing from), which the old
// logic treated identically to "candidate has every required skill" —
// rendering "though it will require building new skills from scratch"
// (whyItFits) directly alongside "your skill set already matches the
// role's requirements" (recommendedAction) on the same card. A listing
// with no detectable requirements at all is not evidence of a match; it's
// missing data, and must say so rather than guessing either way.
function resolveJobCareerPathState(job: JobOpportunity, skillGaps: SkillGap[]): CareerPathDataState {
  if (job.requiredSkills.length === 0) return 'insufficient_data';
  return skillGaps.length === 0 ? 'ready_now' : 'skill_enhanced';
}

function buildJobCareerPath(id: string, job: JobOpportunity, userSkills: Skill[], matchedJobs: JobOpportunity[]): CareerPath {
  const skillGaps = calculateSkillGaps(userSkills, job.requiredSkills);
  const matchedSkillNames = job.requiredSkills.filter((skill) => hasSkill(userSkills, skill.name)).map((skill) => skill.name);
  const dataState = resolveJobCareerPathState(job, skillGaps);

  let whyItFits: string;
  let recommendedAction: string;

  if (dataState === 'insufficient_data') {
    whyItFits = "Skill requirements were not specified in this listing, so PivotPartner can't reliably assess the skill fit.";
    recommendedAction = `Review the full listing at ${job.company} directly — PivotPartner doesn't have enough information from this posting to recommend a skill-building next step.`;
  } else if (dataState === 'ready_now') {
    // requiredSkills.length > 0 and skillGaps.length === 0 together mean
    // every required skill was matched, so matchedSkillNames is always
    // non-empty here.
    whyItFits = `You already bring ${matchedSkillNames.slice(0, 3).join(', ')}, covering all ${job.requiredSkills.length} skills this role requires.`;
    recommendedAction = `Apply directly to ${job.company} — your skill set already matches the role's requirements.`;
  } else {
    whyItFits =
      matchedSkillNames.length > 0
        ? `You already bring ${matchedSkillNames.slice(0, 3).join(', ')}, covering ${matchedSkillNames.length} of the ${job.requiredSkills.length} skills this role requires.`
        : `This role fits your target location and work preferences, though it will require building new skills from scratch.`;
    const { names, totalWeeks, orgContextNames } = describeSkillGaps(skillGaps);
    if (names && orgContextNames.length > 0) {
      recommendedAction = `Spend roughly ${totalWeeks} weeks closing the gap in ${names}, then apply to ${job.company}. ${describeOrgContextSkills(orgContextNames)}`;
    } else if (names) {
      recommendedAction = `Spend roughly ${totalWeeks} weeks closing the gap in ${names}, then apply to ${job.company}.`;
    } else {
      recommendedAction = `${describeOrgContextSkills(orgContextNames)} Apply to ${job.company} and build this once you're in the role.`;
    }
  }

  const opportunities = matchedJobs.filter((j) => j.matchScore >= job.matchScore - 10).length;

  return {
    id,
    title: job.title,
    matchPercentage: job.matchScore,
    whyItFits,
    salaryRange: job.salaryRange,
    opportunities,
    skillGaps,
    recommendedAction,
    // Passed through from matchJobsForUser's own computation (job already
    // carries it) — never recomputed here.
    occupationCategory: job.occupationCategory,
    dataState,
  };
}

// Step D: production users must never receive a mock freelance gig merely
// because none of the matching substrate was genuinely relevant — the
// confirmed bug (a Teacher or Journalist, with zero overlap against every
// gig in mockFreelanceGigs, still received "Freelance: Power BI Dashboard
// Development" at 0%, purely because it happened to be first in array
// order once every gig tied at a raw score of 0). "Genuinely relevant"
// here means the top-scoring gig, after occupation-aware gating, has at
// least one actually matched skill — zero matched skills is not a
// transition opportunity, it's no evidence of fit at all.
const NO_RELEVANT_FREELANCE_MESSAGE = 'No relevant freelance opportunities found right now.';

function buildFreelanceCareerPath(
  id: string,
  userSkills: Skill[],
  likelyRole: string | undefined,
  industries: string[] | undefined
): CareerPath {
  const freelanceMatches = matchFreelanceForUser(userSkills, likelyRole, industries);
  const topGig = freelanceMatches[0];
  const matchedSkillNames = topGig
    ? topGig.requiredSkills.filter((skill) => hasSkill(userSkills, skill.name)).map((skill) => skill.name)
    : [];

  if (!topGig || matchedSkillNames.length === 0) {
    return {
      id,
      title: 'Freelance & Consulting',
      matchPercentage: 0,
      whyItFits: NO_RELEVANT_FREELANCE_MESSAGE,
      salaryRange: '',
      opportunities: 0,
      skillGaps: [],
      recommendedAction: NO_RELEVANT_FREELANCE_MESSAGE,
      isUnavailable: true,
    };
  }

  const skillGaps = calculateSkillGaps(userSkills, topGig.requiredSkills);

  const whyItFits = `Freelancing on ${topGig.platform} lets you monetize ${matchedSkillNames.join(', ')} right away while you build a remote-work track record.`;

  let recommendedAction: string;
  if (skillGaps.length > 0) {
    const { names, totalWeeks, orgContextNames } = describeSkillGaps(skillGaps);
    if (names && orgContextNames.length > 0) {
      recommendedAction = `Take a focused course in ${names} (~${totalWeeks} weeks) to strengthen your bids, then apply to gigs like "${topGig.title}" on ${topGig.platform}. ${describeOrgContextSkills(orgContextNames)}`;
    } else if (names) {
      recommendedAction = `Take a focused course in ${names} (~${totalWeeks} weeks) to strengthen your bids, then apply to gigs like "${topGig.title}" on ${topGig.platform}.`;
    } else {
      recommendedAction = `${describeOrgContextSkills(orgContextNames)} Apply to gigs like "${topGig.title}" on ${topGig.platform} and build this once you're engaged.`;
    }
  } else {
    recommendedAction = `Create a ${topGig.platform} profile and start bidding on gigs like "${topGig.title}" — you already meet the required skills.`;
  }

  const opportunities = mockFreelanceGigs.filter((gig) =>
    gig.requiredSkills.some((skill) => hasSkill(topGig.requiredSkills, skill.name))
  ).length;

  return {
    id,
    title: `Freelance: ${topGig.title}`,
    matchPercentage: topGig.matchPercentage,
    whyItFits,
    salaryRange: topGig.budget,
    opportunities,
    skillGaps,
    recommendedAction,
    occupationCategory: topGig.occupationCategory,
  };
}

export function generateCareerPaths(
  userSkills: Skill[],
  matchedJobs: JobOpportunity[],
  likelyRole?: string,
  industries?: string[]
): CareerPath[] {
  const paths: CareerPath[] = [];

  if (matchedJobs[0]) {
    paths.push(buildJobCareerPath('path_001', matchedJobs[0], userSkills, matchedJobs));
  }

  if (matchedJobs[1]) {
    paths.push(buildJobCareerPath('path_002', matchedJobs[1], userSkills, matchedJobs));
  }

  // Always pushed — either a genuinely relevant gig or the honest
  // "no relevant freelance opportunities" placeholder (Step D). Never
  // omitted, so the Career Paths grid keeps its existing 3-card structure
  // instead of silently collapsing to 2.
  paths.push(buildFreelanceCareerPath('path_003', userSkills, likelyRole, industries));

  return paths;
}

// Merges each generated career path's own skill gaps (already computed above
// by calculateSkillGaps, via buildJobCareerPath/buildFreelanceCareerPath)
// into one deduped, profile-level list. Not a second gap calculation — every
// SkillGap here was already produced by the existing engine; this only
// aggregates results so a caller isn't limited to a single path's view.
// Shared by SkillAnalysis.tsx (dashboard) and App.tsx (post-resume chat
// summary) so both stay consistent with each other.
export function mergeCareerPathSkillGaps(paths: CareerPath[]): SkillGap[] {
  const seen = new Set<string>();
  const merged: SkillGap[] = [];

  for (const path of paths) {
    for (const gap of path.skillGaps) {
      const key = gap.skill.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(gap);
      }
    }
  }

  return merged;
}
