import type { ResumeProfile, Skill, JobOpportunity, FreelanceGig, CareerPath, CareerPathDataState, SkillGap } from '../types';
import { mockRemoteJobs, mockFreelanceGigs } from './mockData';
import { calculateMatchScore, calculateSkillGaps } from './skillAnalysisService';
import { classifyOccupationCompatibility } from './occupationMatchingService';

// Occupation/domain compatibility is applied here exactly the same way
// recommendationService.ts's scoreJob() applies it — a gate on the
// existing skill-based score (calculateMatchScore, unchanged), never an
// additive term, so raw skill overlap alone can no longer make a clearly
// unrelated job (or Career Path built from one) look like a strong match.
// This is what feeds SkillAnalysis.tsx's "Career Paths" section and the
// AI context/chat summary — the same failure mode Step 5 already closed
// for the main Recommended Paths cards existed here too, just via a
// separate scoring pipeline (calculateMatchScore has no occupation
// awareness of its own, by design — see skillAnalysisService.ts).
export function matchJobsForUser(profile: ResumeProfile, jobs: JobOpportunity[] = mockRemoteJobs): JobOpportunity[] {
  return jobs
    .map((job) => {
      const rawScore = calculateMatchScore(profile.skills, job.requiredSkills, []);
      const compatibility = classifyOccupationCompatibility(
        profile.likelyRole,
        profile.industries,
        job.title,
        job.description
      );
      let matchScore = Math.round(rawScore * compatibility.multiplier);
      if (compatibility.cap !== undefined) {
        matchScore = Math.min(matchScore, compatibility.cap);
      }
      matchScore = Math.max(0, Math.min(100, matchScore));
      return { ...job, matchScore, occupationCategory: compatibility.category };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

// Occupation/domain compatibility applied to freelance gigs exactly the
// same way matchJobsForUser applies it to jobs (Step D) — a gate on the
// existing skill-based score, never an additive term, so an occupationally
// irrelevant gig with a lucky skill overlap (e.g. a generic "Excel" or
// "Data Analysis" requirement) can't outrank a genuinely relevant one.
// likelyRole/industries are optional so any existing caller that doesn't
// have profile context keeps working exactly as before (an unresolvable
// candidate domain is 'unknown', multiplier 1 — see
// occupationMatchingService.ts) — this never regresses a case that worked
// before Step D, it only adds gating where profile context is available.
export function matchFreelanceForUser(
  userSkills: Skill[],
  likelyRole?: string,
  industries?: string[],
  gigs: FreelanceGig[] = mockFreelanceGigs
): FreelanceGig[] {
  return gigs
    .map((gig) => {
      const rawScore = calculateMatchScore(userSkills, gig.requiredSkills, []);
      // FreelanceGig has no description field — classification relies on
      // the gig's title alone, which still catches same-domain/adjacent
      // gigs and the hint-word bridge (occupationMatchingService.ts).
      const compatibility = classifyOccupationCompatibility(likelyRole, industries, gig.title, undefined);
      let matchPercentage = Math.round(rawScore * compatibility.multiplier);
      if (compatibility.cap !== undefined) {
        matchPercentage = Math.min(matchPercentage, compatibility.cap);
      }
      matchPercentage = Math.max(0, Math.min(100, matchPercentage));
      return { ...gig, matchPercentage, occupationCategory: compatibility.category };
    })
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, 3);
}

function hasSkill(skills: Skill[], name: string): boolean {
  return skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase());
}

function describeSkillGaps(skillGaps: SkillGap[]): { names: string; totalWeeks: number } {
  const names = skillGaps.map((gap) => gap.skill.name).join(', ');
  const totalWeeks = skillGaps.reduce((sum, gap) => sum + gap.estimatedTimeWeeks, 0);
  return { names, totalWeeks };
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
    const { names, totalWeeks } = describeSkillGaps(skillGaps);
    recommendedAction = `Spend roughly ${totalWeeks} weeks closing the gap in ${names}, then apply to ${job.company}.`;
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
    const { names, totalWeeks } = describeSkillGaps(skillGaps);
    recommendedAction = `Take a focused course in ${names} (~${totalWeeks} weeks) to strengthen your bids, then apply to gigs like "${topGig.title}" on ${topGig.platform}.`;
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
