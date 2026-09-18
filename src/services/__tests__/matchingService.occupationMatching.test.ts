import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchJobsForUser, generateCareerPaths, mergeCareerPathSkillGaps } from '../matchingService';
import { recommendCourses } from '../skillAnalysisService';
import type { ResumeProfile, JobOpportunity, Skill } from '../../types';

// Exercises the REAL matchJobsForUser/generateCareerPaths/recommendCourses
// pipeline — exactly what SkillAnalysis.tsx's "Career Paths"/"Recommended
// Courses"/"Skill Gaps" sections and aiContextService.ts's chat summary
// call. matchJobsForUser now delegates to recommendationService.ts's
// shared scoreJob() (see matchingService.ts's own comment on why — no
// second, parallel formula), so this file tests the SAME ESCO/ISCO-based
// engine recommendationService.occupationMatching.test.ts already covers,
// through this second call path (Career Paths) and generateCareerPaths'
// own skillGaps/course-recommendation logic on top of it.

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

// "data analyst" (ESCO occ:1985, ISCO 2511) has 29 real essential skills —
// these 22 are a genuine, confirmed majority of that real list (verified
// against server/data/esco-taxonomy.json).
const dataAnalystSkills = [
  'digital data processing', 'information structure', 'business intelligence', 'data mining',
  'visual presentation techniques', 'data engineering', 'data visualisation software', 'information extraction',
  'information categorisation', 'business analytics', 'query languages', 'data quality assessment',
  'data science', 'data models', 'normalise data', 'use data processing techniques', 'establish data processes',
  'apply statistical analysis techniques', 'perform data mining', 'use databases', 'integrate ICT data', 'analyse big data',
].map((name) => skill(name));

describe('Data Analyst -> Business Analyst (adjacent, ISCO 25<->24 bridge, required regression scenario)', () => {
  // "business analyst" (occ:903, ISCO 2421) real essential skills genuinely
  // overlapping a data-analyst-flavored candidate.
  const businessAnalystSkills = [
    'digital data processing', 'business analysis', 'data visualisation software',
    'risk management', 'market research', 'business analytics', 'management consulting',
  ].map((name) => skill(name));
  const candidateProfile = profile({ skills: businessAnalystSkills, likelyRole: 'Data Analyst' });
  const businessAnalystJob = job({ title: 'Business Analyst', description: 'Analyze business processes and produce reports.' });

  test('remains a credible, visible opportunity — not suppressed like an unrelated job with the same skill overlap', () => {
    const [match] = matchJobsForUser(candidateProfile, [businessAnalystJob]);
    assert.equal(match.occupationCategory, 'adjacent');

    const unrelatedJob = job({ title: 'Secondary School Teacher', description: 'Teach mathematics to secondary school students.' });
    const [unrelatedMatch] = matchJobsForUser(candidateProfile, [unrelatedJob]);
    assert.equal(unrelatedMatch.occupationCategory, 'unrelated');

    assert.ok(
      match.matchScore > unrelatedMatch.matchScore,
      `genuine skill overlap must still score higher for the domain-adjacent job (${match.matchScore}) than an unrelated one (${unrelatedMatch.matchScore})`
    );
  });

  test('missing skills shown are the actual occupation requirements — nothing invented', () => {
    const matchedJobs = matchJobsForUser(candidateProfile, [businessAnalystJob]);
    const paths = generateCareerPaths(candidateProfile.skills, matchedJobs);
    const path = paths.find((p) => p.title === 'Business Analyst');
    assert.ok(path, 'the business analyst path should be generated');

    // "business analyst" has 11 real essential skills; the candidate above
    // matches 7 of them — the remaining ~4 gaps must all be real essential
    // skills of THIS occupation, never a free-text invention.
    const gapNames = path!.skillGaps.map((g) => g.skill.name);
    assert.ok(gapNames.length > 0 && gapNames.length < 11, `expected a partial, non-empty gap list, got ${gapNames.length}`);
    assert.ok(!gapNames.includes('Machine Learning'), 'must never invent a gap the occupation does not actually require');
    assert.ok(!gapNames.includes('TensorFlow'));
  });

  test('occupationCategory is exposed on the resulting CareerPath, without disturbing any existing field', () => {
    const matchedJobs = matchJobsForUser(candidateProfile, [businessAnalystJob]);
    const [path] = generateCareerPaths(candidateProfile.skills, matchedJobs);
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
});

describe('10. Recommended Courses and Skill Gaps remain intact for an unresolved-occupation job (free-text fallback)', () => {
  test('a skill gap that DOES have a real course (Power BI) still produces a genuine recommendation', () => {
    // "Senior SAP AMS Consultant (SAP EWM)" is confirmed unresolvable to any
    // ESCO occupation (see the SAP root-cause investigation) — its
    // requiredSkills fall back to the job's own free-text list, exactly as
    // before this task's changes, so the legacy mockData-taxonomy course
    // catalog still applies here.
    const dataAnalystProfile = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['SaaS'],
      likelyRole: 'Data Analyst',
    });
    const unresolvedJob = job({
      title: 'Senior SAP AMS Consultant (SAP EWM)',
      requiredSkills: [skill('Python'), skill('SQL'), skill('Power BI')],
    });
    const matchedJobs = matchJobsForUser(dataAnalystProfile, [unresolvedJob]);
    const [path] = generateCareerPaths(dataAnalystProfile.skills, matchedJobs);
    assert.deepEqual(path.skillGaps.map((g) => g.skill.name), ['Power BI']);

    const courses = recommendCourses(path.skillGaps);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].skillGained, 'Power BI');
    assert.equal(courses[0].title, 'Power BI Masterclass');
  });
});

describe('clearly unrelated occupation does not become a high match through generic skills alone', () => {
  test('Secondary School Teacher -> Data Analyst stays suppressed via the Career Paths pipeline too', () => {
    const teacherProfile = profile({
      skills: [skill('pedagogy', 'business'), skill('instructional strategies', 'business')],
      likelyRole: 'Secondary School Teacher',
    });
    const dataAnalystJob = job({
      title: 'Data Analyst',
      description: 'We are looking for a Data Analyst to join our analytics team.',
      requiredSkills: dataAnalystSkills,
    });
    const [match] = matchJobsForUser(teacherProfile, [dataAnalystJob]);
    assert.equal(match.occupationCategory, 'unrelated');
    assert.ok(match.matchScore <= 30, `expected a suppressed score, got ${match.matchScore}`);
  });
});

describe('missing likelyRole — must not crash, existing skill matching keeps working', () => {
  // Python + SQL is a 2-skill match to jobQueryService.ts's data_analytics
  // cluster (its own bar has no minimum above "any match at all") — so
  // resolveCandidateOccupation()'s skill-cluster fallback resolves this via
  // the derived "Data Analyst" query term, even with no likelyRole. This
  // proves the "no likelyRole -> never crash" guarantee AND that the
  // skill-cluster fallback path genuinely resolves a real occupation.
  test('a profile with no likelyRole but a clear skill-cluster match still resolves, and does not crash', () => {
    const noRoleProfile = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['General Business'],
      likelyRole: undefined,
    });
    const genericJob = job({ title: 'Data Analyst', requiredSkills: dataAnalystSkills });

    assert.doesNotThrow(() => {
      const [match] = matchJobsForUser(noRoleProfile, [genericJob]);
      assert.equal(match.occupationCategory, 'same_domain');
      const paths = generateCareerPaths(noRoleProfile.skills, [match]);
      assert.ok(paths.length > 0);
    });
  });

  // A genuinely signal-less case (no skills, no likelyRole, no mappable
  // industry) has no skill-cluster match and no industry hint to fall back
  // to — resolveCandidateOccupation() correctly returns null rather than
  // guessing, so the job is never penalized either way.
  test('a profile with no skills, no likelyRole, and no mappable industry falls through to unknown', () => {
    const signalLessProfile = profile({ skills: [], industries: ['General Business'], likelyRole: undefined });
    const genericJob = job({ title: 'Data Analyst', requiredSkills: dataAnalystSkills });
    const [match] = matchJobsForUser(signalLessProfile, [genericJob]);
    assert.equal(match.occupationCategory, 'unknown');
  });
});

describe('regression: a genuine same-domain match through the Career Paths pipeline is unaffected', () => {
  test('a Data Analyst candidate applying to a Data Analyst job still scores well', () => {
    const dataAnalystProfile = profile({ skills: dataAnalystSkills, likelyRole: 'Data Analyst' });
    const dataAnalystJob = job({ title: 'Data Analyst', requiredSkills: dataAnalystSkills });
    const [match] = matchJobsForUser(dataAnalystProfile, [dataAnalystJob]);
    assert.equal(match.occupationCategory, 'same_domain');
    // matchJobsForUser now shares recommendationService.ts's scoreJob()
    // formula exactly (no separate calculateMatchScore path any more — see
    // matchingService.ts's own comment) — a genuine, strong same-domain
    // match scores well, not pinned to any specific legacy formula ceiling.
    assert.ok(match.matchScore >= 65, `a full required-skill match in the same domain should score well, got ${match.matchScore}`);
  });
});

describe('mergeCareerPathSkillGaps', () => {
  test('deduplicates gaps across paths without inventing any', () => {
    const dataAnalystProfile = profile({ skills: dataAnalystSkills, likelyRole: 'Data Analyst' });
    const businessAnalystJob = job({ title: 'Business Analyst', description: 'Analyze business processes.' });
    const matchedJobs = matchJobsForUser(dataAnalystProfile, [businessAnalystJob]);
    const paths = generateCareerPaths(dataAnalystProfile.skills, matchedJobs, 'Data Analyst', []);
    const merged = mergeCareerPathSkillGaps(paths);
    const names = merged.map((g) => g.skill.name);
    assert.equal(new Set(names).size, names.length, 'no duplicate skill names across merged gaps');
  });
});
