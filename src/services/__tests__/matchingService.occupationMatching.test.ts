import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchJobsForUser, generateCareerPaths, mergeCareerPathSkillGaps } from '../matchingService';
import { recommendCourses } from '../skillAnalysisService';
import type { ResumeProfile, JobOpportunity, Skill } from '../../types';

// Exercises the REAL matchJobsForUser/generateCareerPaths/recommendCourses
// pipeline — exactly what SkillAnalysis.tsx's "Career Paths"/"Recommended
// Courses"/"Skill Gaps" sections and aiContextService.ts's chat summary
// call — so these tests prove the occupation-aware fix holds at the
// second, previously-uncovered scoring pipeline (Step 5 only touched
// recommendationService.ts's Recommended Paths cards).

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

const marineBiologistProfile = profile({
  skills: [skill('Python'), skill('SQL')],
  industries: ['Marine Science'],
  likelyRole: 'Marine Biologist',
});

describe('Marine Biologist -> Environmental Data Analyst (required regression scenario)', () => {
  const environmentalAnalystJob = job({
    title: 'Environmental Data Analyst',
    description: 'Analyze environmental datasets to support conservation research using GIS and statistical methods.',
    requiredSkills: [skill('Python'), skill('SQL'), skill('GIS'), skill('Statistics')],
  });

  test('remains a credible, visible opportunity — not suppressed like an unrelated job with the same skill overlap', () => {
    const [envMatch] = matchJobsForUser(marineBiologistProfile, [environmentalAnalystJob]);
    assert.equal(envMatch.occupationCategory, 'adjacent');

    const unrelatedJob = job({
      title: 'Software Engineer',
      description: 'Build and maintain backend services.',
      requiredSkills: [skill('Python'), skill('SQL'), skill('JavaScript'), skill('React')],
    });
    const [unrelatedMatch] = matchJobsForUser(marineBiologistProfile, [unrelatedJob]);
    assert.equal(unrelatedMatch.occupationCategory, 'unrelated');

    assert.ok(
      envMatch.matchScore > unrelatedMatch.matchScore,
      `identical skill overlap (2/4 required skills matched) must still score higher for the domain-adjacent job (${envMatch.matchScore}) than the unrelated one (${unrelatedMatch.matchScore})`
    );
  });

  test('missing skills shown are the actual job requirements (GIS, Statistics) — nothing invented', () => {
    const matchedJobs = matchJobsForUser(marineBiologistProfile, [environmentalAnalystJob]);
    const paths = generateCareerPaths(marineBiologistProfile.skills, matchedJobs);
    const envPath = paths.find((p) => p.title === 'Environmental Data Analyst');
    assert.ok(envPath, 'the environmental analyst path should be generated');

    const gapNames = envPath!.skillGaps.map((g) => g.skill.name).sort();
    assert.deepEqual(gapNames, ['GIS', 'Statistics']);
    assert.ok(!gapNames.includes('Machine Learning'), 'must never invent a gap the job does not actually require');
    assert.ok(!gapNames.includes('TensorFlow'));

    const merged = mergeCareerPathSkillGaps(paths);
    assert.ok(merged.some((g) => g.skill.name === 'GIS'));
    assert.ok(merged.some((g) => g.skill.name === 'Statistics'));
  });

  test('occupationCategory is exposed on the resulting CareerPath, without disturbing any existing field', () => {
    const matchedJobs = matchJobsForUser(marineBiologistProfile, [environmentalAnalystJob]);
    const [path] = generateCareerPaths(marineBiologistProfile.skills, matchedJobs);
    // Every field the existing UI already reads must still be present and
    // correctly typed — this is a purely additive field.
    assert.equal(typeof path.id, 'string');
    assert.equal(typeof path.title, 'string');
    assert.equal(typeof path.matchPercentage, 'number');
    assert.equal(typeof path.whyItFits, 'string');
    assert.equal(typeof path.salaryRange, 'string');
    assert.equal(typeof path.opportunities, 'number');
    assert.ok(Array.isArray(path.skillGaps));
    assert.equal(typeof path.recommendedAction, 'string');
    assert.equal(path.occupationCategory, 'adjacent');
  });

  test('no verified course exists for GIS/Statistics — recommendCourses never fabricates one', () => {
    const matchedJobs = matchJobsForUser(marineBiologistProfile, [environmentalAnalystJob]);
    const paths = generateCareerPaths(marineBiologistProfile.skills, matchedJobs);
    const gaps = mergeCareerPathSkillGaps(paths).filter((g) => ['GIS', 'Statistics'].includes(g.skill.name));
    const courses = recommendCourses(gaps);
    assert.equal(courses.length, 0, 'no real course exists for GIS/Statistics in the app\'s course data — none should be fabricated');
  });
});

describe('10. Recommended Courses and Skill Gaps remain intact for a normal same-domain gap', () => {
  test('a skill gap that DOES have a real course (Power BI) still produces a genuine recommendation', () => {
    const dataAnalystProfile = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['SaaS'],
      likelyRole: 'Data Analyst',
    });
    const dataAnalystJob = job({
      title: 'Data Analyst',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Power BI')],
    });
    const matchedJobs = matchJobsForUser(dataAnalystProfile, [dataAnalystJob]);
    const [path] = generateCareerPaths(dataAnalystProfile.skills, matchedJobs);
    assert.deepEqual(path.skillGaps.map((g) => g.skill.name), ['Power BI']);

    const courses = recommendCourses(path.skillGaps);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].skillGained, 'Power BI');
    assert.equal(courses[0].title, 'Power BI Masterclass');
  });
});

describe('clearly unrelated occupation does not become a high match through generic skills alone', () => {
  test('Marine Biologist -> Data Analyst stays suppressed via the Career Paths pipeline too', () => {
    const dataAnalystJob = job({
      title: 'Data Analyst',
      description: 'We are looking for a Data Analyst to join our analytics team.',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
    });
    const [match] = matchJobsForUser(marineBiologistProfile, [dataAnalystJob]);
    assert.equal(match.occupationCategory, 'unrelated');
    assert.ok(match.matchScore <= 30, `expected a suppressed score, got ${match.matchScore}`);
  });
});

describe('skill-enhanced opportunity: real missing requirements are shown honestly', () => {
  test('Marine Biologist -> Machine Learning Engineer shows the actual missing skills (ML, TensorFlow), not invented ones', () => {
    const mlEngineerJob = job({
      title: 'Machine Learning Engineer',
      description: 'Build machine learning models using TensorFlow.',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Machine Learning'), skill('TensorFlow')],
    });
    const matchedJobs = matchJobsForUser(marineBiologistProfile, [mlEngineerJob]);
    const [path] = generateCareerPaths(marineBiologistProfile.skills, matchedJobs);
    const gapNames = path.skillGaps.map((g) => g.skill.name).sort();
    assert.deepEqual(gapNames, ['Machine Learning', 'TensorFlow']);
  });
});

describe('missing likelyRole — must not crash, existing skill matching keeps working', () => {
  test('a profile with no likelyRole and no mappable industry scores purely on skills, unmodified', () => {
    const noRoleProfile = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['General Business'],
      likelyRole: undefined,
    });
    const genericJob = job({
      title: 'Data Analyst',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
    });

    assert.doesNotThrow(() => {
      const [match] = matchJobsForUser(noRoleProfile, [genericJob]);
      assert.equal(match.occupationCategory, 'unknown');
      const paths = generateCareerPaths(noRoleProfile.skills, [match]);
      assert.ok(paths.length > 0);
    });
  });
});

describe('regression: a genuine same-domain match through the Career Paths pipeline is unaffected', () => {
  test('a Data Analyst candidate applying to a Data Analyst job still scores well', () => {
    const dataAnalystProfile = profile({
      skills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
      industries: ['SaaS'],
      likelyRole: 'Data Analyst',
    });
    const dataAnalystJob = job({
      title: 'Data Analyst',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Data Analysis'), skill('Power BI')],
    });
    const [match] = matchJobsForUser(dataAnalystProfile, [dataAnalystJob]);
    assert.equal(match.occupationCategory, 'same_domain');
    // calculateMatchScore (skillAnalysisService.ts, unchanged) reserves 30
    // of its 100 points for a "nice to have" list matchJobsForUser has
    // never supplied — so a full required-skill match has always topped
    // out at 70 here, before and after this task's changes. same_domain's
    // ×1 multiplier means that pre-existing ceiling is preserved exactly.
    assert.equal(match.matchScore, 70, 'a full required-skill match in the same domain must be unmodified from its pre-existing score');
  });
});
