import type { Skill, JobOpportunity, FreelanceGig, CareerPath, SkillGap } from '../types';
import { mockRemoteJobs, mockFreelanceGigs } from './mockData';
import { calculateMatchScore, calculateSkillGaps } from './skillAnalysisService';

export function matchJobsForUser(userSkills: Skill[], jobs: JobOpportunity[] = mockRemoteJobs): JobOpportunity[] {
  return jobs
    .map((job) => ({ ...job, matchScore: calculateMatchScore(userSkills, job.requiredSkills, []) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

export function matchFreelanceForUser(userSkills: Skill[], gigs: FreelanceGig[] = mockFreelanceGigs): FreelanceGig[] {
  return gigs
    .map((gig) => ({ ...gig, matchPercentage: calculateMatchScore(userSkills, gig.requiredSkills, []) }))
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

function buildJobCareerPath(id: string, job: JobOpportunity, userSkills: Skill[], matchedJobs: JobOpportunity[]): CareerPath {
  const skillGaps = calculateSkillGaps(userSkills, job.requiredSkills);
  const matchedSkillNames = job.requiredSkills.filter((skill) => hasSkill(userSkills, skill.name)).map((skill) => skill.name);

  const whyItFits =
    matchedSkillNames.length > 0
      ? `You already bring ${matchedSkillNames.slice(0, 3).join(', ')}, covering ${matchedSkillNames.length} of the ${job.requiredSkills.length} skills this role requires.`
      : `This role fits your target location and work preferences, though it will require building new skills from scratch.`;

  let recommendedAction: string;
  if (skillGaps.length > 0) {
    const { names, totalWeeks } = describeSkillGaps(skillGaps);
    recommendedAction = `Spend roughly ${totalWeeks} weeks closing the gap in ${names}, then apply to ${job.company}.`;
  } else {
    recommendedAction = `Apply directly to ${job.company} — your skill set already matches the role's requirements.`;
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
  };
}

function buildFreelanceCareerPath(id: string, userSkills: Skill[]): CareerPath | null {
  const freelanceMatches = matchFreelanceForUser(userSkills);
  const topGig = freelanceMatches[0];
  if (!topGig) return null;

  const skillGaps = calculateSkillGaps(userSkills, topGig.requiredSkills);
  const matchedSkillNames = topGig.requiredSkills.filter((skill) => hasSkill(userSkills, skill.name)).map((skill) => skill.name);

  const whyItFits =
    matchedSkillNames.length > 0
      ? `Freelancing on ${topGig.platform} lets you monetize ${matchedSkillNames.join(', ')} right away while you build a remote-work track record.`
      : `Freelancing on ${topGig.platform} is a low-risk way to test remote work while you build the skills this niche needs.`;

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
  };
}

export function generateCareerPaths(userSkills: Skill[], matchedJobs: JobOpportunity[]): CareerPath[] {
  const paths: CareerPath[] = [];

  if (matchedJobs[0]) {
    paths.push(buildJobCareerPath('path_001', matchedJobs[0], userSkills, matchedJobs));
  }

  if (matchedJobs[1]) {
    paths.push(buildJobCareerPath('path_002', matchedJobs[1], userSkills, matchedJobs));
  }

  const freelancePath = buildFreelanceCareerPath('path_003', userSkills);
  if (freelancePath) {
    paths.push(freelancePath);
  }

  return paths;
}
