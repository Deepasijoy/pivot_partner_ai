import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchJobsForUser, generateCareerPaths } from '../matchingService';
import type { ResumeProfile, JobOpportunity, Skill } from '../../types';

// Step C regression: a Career Path must never render a self-contradictory
// pair like "though it will require building new skills from scratch"
// (whyItFits) alongside "your skill set already matches the role's
// requirements" (recommendedAction) — the confirmed bug, reproduced live
// for German-language job postings with zero detected required skills.
// matchingService.ts's buildJobCareerPath now resolves one of three
// explicit states (dataState) before choosing any wording at all.

function skill(name: string, category: Skill['category'] = 'technical'): Skill {
  return { name, category, demandLevel: 'high', proficiency: 70 };
}

function job(overrides: Partial<JobOpportunity>): JobOpportunity {
  return {
    id: `job_${Math.random().toString(36).slice(2)}`,
    title: 'Untitled Role',
    company: 'Acme Corp',
    salaryRange: '70000-90000',
    timezone: 'Remote',
    matchScore: 0,
    requiredSkills: [],
    matchedSkills: [],
    missingSkills: [],
    description: '',
    employmentMatch: 0,
    ...overrides,
  };
}

function profile(overrides: Partial<ResumeProfile>): ResumeProfile {
  return { skills: [], experience: '', yearsExperience: 5, industries: [], ...overrides };
}

const bankerProfile = profile({
  skills: [skill('Financial Analysis', 'business'), skill('Excel', 'business')],
  industries: ['Finance'],
  likelyRole: 'Banker',
});

describe('Career Path data states (Step C)', () => {
  test('INSUFFICIENT_DATA: a listing with zero detected required skills never claims a match, never invents a gap, and is never rendered as "ready now"', () => {
    const noRequirementsJob = job({
      title: 'Rechtsanwalt (m/w/d) - Bank- und Kapitalmarktrecht',
      company: 'Malmendier Legal',
      description: 'Rechtsanwalt gesucht.', // German text with no detected English taxonomy skills
      requiredSkills: [],
    });
    const [match] = matchJobsForUser(bankerProfile, [noRequirementsJob]);
    const [path] = generateCareerPaths(bankerProfile.skills, [match]);

    assert.equal(path.dataState, 'insufficient_data');
    assert.deepEqual(path.skillGaps, []);
    // The two lines that previously contradicted each other must now agree:
    // neither claims the candidate matches, neither claims new skills are
    // needed — both honestly say the requirements aren't known.
    assert.match(path.whyItFits, /not specified|can't reliably assess/i);
    assert.doesNotMatch(path.whyItFits, /already matches|building new skills from scratch/i);
    assert.doesNotMatch(path.recommendedAction, /already matches the role's requirements/i);
  });

  test('READY_NOW: real requirements exist and the candidate has every one of them — both lines agree', () => {
    const fullyMatchedJob = job({
      title: 'Senior Banker',
      company: 'First National Bank',
      requiredSkills: [skill('Financial Analysis', 'business'), skill('Excel', 'business')],
    });
    const [match] = matchJobsForUser(bankerProfile, [fullyMatchedJob]);
    const [path] = generateCareerPaths(bankerProfile.skills, [match]);

    assert.equal(path.dataState, 'ready_now');
    assert.deepEqual(path.skillGaps, []);
    assert.match(path.whyItFits, /You already bring/);
    assert.match(path.recommendedAction, /already matches the role's requirements/);
  });

  test('SKILL_ENHANCED: real requirements exist, some overlap, real remaining gaps — both lines agree on the gap, nothing invented', () => {
    const partialJob = job({
      title: 'Finance Manager',
      company: 'Global Finance Co',
      requiredSkills: [skill('Financial Analysis', 'business'), skill('Excel', 'business'), skill('Financial Modeling', 'business')],
    });
    const [match] = matchJobsForUser(bankerProfile, [partialJob]);
    const [path] = generateCareerPaths(bankerProfile.skills, [match]);

    assert.equal(path.dataState, 'skill_enhanced');
    assert.deepEqual(path.skillGaps.map((g) => g.skill.name), ['Financial Modeling']);
    assert.match(path.whyItFits, /You already bring/);
    assert.match(path.recommendedAction, /Financial Modeling/);
    assert.doesNotMatch(path.recommendedAction, /already matches the role's requirements/);
  });

  test('SKILL_ENHANCED with zero overlap: real requirements exist but none are matched — honest "from scratch" wording, paired with the real gap list, never "already matches"', () => {
    const noOverlapJob = job({
      title: 'Backend Engineer',
      company: 'Tech Co',
      requiredSkills: [skill('Python'), skill('SQL')],
    });
    const [match] = matchJobsForUser(bankerProfile, [noOverlapJob]);
    const [path] = generateCareerPaths(bankerProfile.skills, [match]);

    assert.equal(path.dataState, 'skill_enhanced');
    assert.deepEqual(path.skillGaps.map((g) => g.skill.name).sort(), ['Python', 'SQL']);
    assert.match(path.whyItFits, /building new skills from scratch/);
    assert.doesNotMatch(path.recommendedAction, /already matches the role's requirements/);
  });
});
