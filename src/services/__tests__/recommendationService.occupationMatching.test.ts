import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getCareerRecommendations } from '../recommendationService';
import type { ResumeProfile, JobOpportunity, Skill } from '../../types';

// Exercises the REAL getCareerRecommendations() — the exact function
// CareerRecommendations.tsx's cards call — so these tests prove the fix
// holds at the actual production integration point, not just inside
// occupationMatchingService.ts's own unit tests.

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
  return {
    skills: [],
    experience: '',
    yearsExperience: 5,
    industries: [],
    ...overrides,
  };
}

const marineBiologistProfile = profile({
  skills: [skill('Python'), skill('SQL')],
  industries: ['Marine Science'],
  likelyRole: 'Marine Biologist',
});

const dataAnalystJob = job({
  title: 'Data Analyst',
  description: 'We are looking for a Data Analyst to join our analytics team.',
  requiredSkills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
});

describe('1. Marine Biologist + Python + SQL -> Data Analyst', () => {
  test('does not receive a high compatibility/ranking result', () => {
    const [rec] = getCareerRecommendations(marineBiologistProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(rec, 'a recommendation should still be produced — the job is not silently dropped');
    assert.ok(rec.matchScore <= 30, `expected a suppressed score for a clearly unrelated occupation, got ${rec.matchScore}`);
  });
});

describe('2. Marine Biologist -> Marine Biology Researcher', () => {
  test('is strongly compatible — a real, unsuppressed score', () => {
    const marineJob = job({
      title: 'Marine Biology Researcher',
      description: 'Conduct marine biology research on coastal ecosystems using data analysis tools.',
      requiredSkills: [skill('Python'), skill('SQL')],
    });
    const [rec] = getCareerRecommendations(marineBiologistProfile, { jobs: [marineJob], limit: 1 });
    assert.ok(rec.matchScore >= 70, `expected a strong same-domain score, got ${rec.matchScore}`);
  });
});

describe('3. Marine Biologist -> Environmental Data Analyst', () => {
  test('remains a viable, visible adjacent transition — not suppressed like the unrelated case', () => {
    const envJob = job({
      title: 'Environmental Data Analyst',
      description: 'Analyze environmental datasets to support conservation research.',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Data Analysis')],
    });
    const [rec] = getCareerRecommendations(marineBiologistProfile, { jobs: [envJob], limit: 1 });
    assert.ok(rec.matchScore > 35, `an adjacent transition must remain meaningfully discoverable, got ${rec.matchScore}`);
    const [suppressedRec] = getCareerRecommendations(marineBiologistProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(
      rec.matchScore > suppressedRec.matchScore,
      'the adjacent transition must still score higher than the same skills scored against a genuinely unrelated job'
    );
  });
});

const journalistProfile = profile({
  skills: [skill('Content Writing', 'business'), skill('SEO', 'business')],
  industries: ['Journalism & Media'],
  likelyRole: 'Journalist',
});

describe('4. Journalist -> Content Strategist', () => {
  test('is compatible/adjacent, not suppressed', () => {
    const contentJob = job({
      title: 'Content Strategist',
      description: 'Own the editorial calendar and content strategy for our brand.',
      requiredSkills: [skill('Content Writing', 'business'), skill('SEO', 'business')],
    });
    const [rec] = getCareerRecommendations(journalistProfile, { jobs: [contentJob], limit: 1 });
    assert.ok(rec.matchScore > 40, `expected an adjacent-tier score, got ${rec.matchScore}`);
  });
});

describe('5. Journalist -> Software Engineer', () => {
  test('does not rank highly merely because of a shared generic skill', () => {
    const engineerJob = job({
      title: 'Software Engineer',
      description: 'Build and maintain our backend services using modern engineering practices.',
      // One shared, generic skill (Project Management) alongside skills
      // the journalist doesn't have — enough overlap that, without the
      // occupation gate, this could still look like a plausible match.
      requiredSkills: [skill('JavaScript'), skill('React'), skill('Project Management', 'business')],
    });
    const journalistWithPM = profile({
      ...journalistProfile,
      skills: [...journalistProfile.skills, skill('Project Management', 'business')],
    });
    const [rec] = getCareerRecommendations(journalistWithPM, { jobs: [engineerJob], limit: 1 });
    assert.ok(rec.matchScore <= 30, `expected a suppressed score despite the shared generic skill, got ${rec.matchScore}`);
  });
});

describe('6. candidate with missing likelyRole', () => {
  test('does not crash, and existing skill-based matching still functions normally', () => {
    const noRoleProfile = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['General Business'],
      likelyRole: undefined,
    });

    assert.doesNotThrow(() => {
      const [rec] = getCareerRecommendations(noRoleProfile, { jobs: [dataAnalystJob], limit: 1 });
      // Occupation is unknown (no likelyRole, and 'General Business' is
      // deliberately unmapped) -> no gate applied -> the existing
      // skill/experience/industry/transferable score stands unmodified.
      assert.ok(rec.matchScore > 30, `an unknown occupation must never be penalized, got ${rec.matchScore}`);
      assert.ok(rec.matchedSkills.length > 0, 'skill matching itself must still work');
    });
  });
});

describe('7. clearly unrelated occupation with strong generic skill overlap', () => {
  test('occupation incompatibility prevents a misleading high score even at 100% skill overlap', () => {
    const perfectSkillOverlapJob = job({
      title: 'Data Analyst',
      description: 'We are looking for a Data Analyst.',
      requiredSkills: [skill('Python'), skill('SQL')], // exactly the candidate's own skills — 100% overlap
    });
    const [rec] = getCareerRecommendations(marineBiologistProfile, { jobs: [perfectSkillOverlapJob], limit: 1 });
    assert.ok(
      rec.matchScore <= 30,
      `even 100% skill overlap must not produce a high score for a clearly unrelated occupation, got ${rec.matchScore}`
    );
  });
});

describe('8. regression: a genuinely good same-occupation match is unaffected', () => {
  test('a Data Analyst candidate applying to a Data Analyst job still scores well', () => {
    const dataAnalystProfile = profile({
      skills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
      industries: ['SaaS'],
      likelyRole: 'Data Analyst',
    });
    const [rec] = getCareerRecommendations(dataAnalystProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(rec.matchScore >= 75, `a genuine same-domain, full-skill-match candidate should still score highly, got ${rec.matchScore}`);
  });
});
