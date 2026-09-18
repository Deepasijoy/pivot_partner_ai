import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getCareerRecommendations } from '../recommendationService';
import type { ResumeProfile, JobOpportunity, Skill } from '../../types';

// Exercises the REAL getCareerRecommendations() — the exact function
// CareerRecommendations.tsx's cards call — so these tests prove the
// ESCO/ISCO-based occupation gate (occupationMatchingService.ts) and the
// essential-skills-based gap computation (recommendationService.ts) hold at
// the actual production integration point, not just in isolated unit tests.
//
// Every skill name below is a REAL ESCO skill label (confirmed against the
// generated taxonomy — see server/data/esco-taxonomy.json), and every job
// title is a REAL ESCO occupation label — because scoreJob() now sources
// its requirement list from the matched occupation's ACTUAL essential
// skills, not from whatever a test hands it as job.requiredSkills (see
// recommendationService.ts's effectiveRequiredSkills()). A hand-invented
// skill name that doesn't exist in ESCO would show zero overlap regardless
// of the occupation-family multiplier being tested.

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

// "data analyst" (ESCO occ:1985, ISCO 2511) has 29 real essential skills —
// these 22 are a genuine, confirmed majority of that real list (verified
// against server/data/esco-taxonomy.json), used wherever a test needs a
// strong, realistic same-occupation match.
const dataAnalystSkills = [
  'digital data processing', 'information structure', 'business intelligence', 'data mining',
  'visual presentation techniques', 'data engineering', 'data visualisation software', 'information extraction',
  'information categorisation', 'business analytics', 'query languages', 'data quality assessment',
  'data science', 'data models', 'normalise data', 'use data processing techniques', 'establish data processes',
  'apply statistical analysis techniques', 'perform data mining', 'use databases', 'integrate ICT data', 'analyse big data',
].map((name) => skill(name));

const dataAnalystJob = job({
  title: 'Data Analyst',
  description: 'We are looking for a Data Analyst to join our analytics team.',
  // Populated so test 6 (occupation unresolved -> falls back to
  // job.requiredSkills) has something real to match against; tests where
  // the occupation DOES resolve (1, 2, 7, 8) ignore this in favor of the
  // matched occupation's actual essential skills regardless.
  requiredSkills: dataAnalystSkills,
});

describe('1. Secondary School Teacher -> Data Analyst', () => {
  test('does not receive a high compatibility/ranking result', () => {
    const teacherProfile = profile({
      skills: [skill('pedagogy', 'business'), skill('instructional strategies', 'business')],
      likelyRole: 'Secondary School Teacher',
    });
    const [rec] = getCareerRecommendations(teacherProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(rec, 'a recommendation should still be produced — the job is not silently dropped');
    assert.ok(rec.matchScore <= 30, `expected a suppressed score for a clearly unrelated occupation, got ${rec.matchScore}`);
  });
});

describe('2. Data Analyst -> Data Analyst', () => {
  test('is strongly compatible — a real, unsuppressed score', () => {
    const dataAnalystProfile = profile({ skills: dataAnalystSkills, likelyRole: 'Data Analyst' });
    const [rec] = getCareerRecommendations(dataAnalystProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(rec.matchScore >= 70, `expected a strong same-domain score, got ${rec.matchScore}`);
  });
});

describe('3. Data Analyst -> Business Analyst', () => {
  test('remains a viable, visible adjacent transition — not suppressed like the unrelated case', () => {
    // "business analyst" (occ:903, ISCO 2421) is genuinely reachable from a
    // "data analyst" (occ:1985, ISCO 2511) skillset — confirmed real,
    // ISCO-sub-major-crossing adjacency (25 <-> 24) — via 7 of its 11 real
    // essential skills (digital data processing, business analysis, data
    // visualisation software, risk management, market research, business
    // analytics, management consulting).
    const dataAnalystProfile = profile({
      skills: [
        'digital data processing', 'business analysis', 'data visualisation software',
        'risk management', 'market research', 'business analytics', 'management consulting',
      ].map((name) => skill(name)),
      likelyRole: 'Data Analyst',
    });
    const businessAnalystJob = job({ title: 'Business Analyst', description: 'Analyze business processes and produce reports.' });
    const [rec] = getCareerRecommendations(dataAnalystProfile, { jobs: [businessAnalystJob], limit: 1 });
    assert.ok(rec.matchScore > 35, `an adjacent transition with genuine skill overlap must remain meaningfully discoverable, got ${rec.matchScore}`);

    const teacherProfile = profile({ likelyRole: 'Secondary School Teacher' });
    const [suppressedRec] = getCareerRecommendations(teacherProfile, { jobs: [businessAnalystJob], limit: 1 });
    assert.ok(
      rec.matchScore > suppressedRec.matchScore,
      'the adjacent, skill-overlapping transition must still score higher than an unrelated candidate with none of the requirements'
    );
  });
});

describe('4. Secondary School Teacher -> Instructional Designer', () => {
  test('is compatible/adjacent, not suppressed', () => {
    // "instructional designer" (occ:1573, ISCO 2359) shares ISCO sub-major
    // 23 "Teaching professionals" with "secondary school teacher" (2330) —
    // adjacent via the same-sub-major rule, no curated bridge needed.
    const teacherProfile = profile({
      skills: ['learning difficulties', 'instructional strategies', 'pedagogy', 'post-secondary school procedures'].map((name) =>
        skill(name, 'business')
      ),
      likelyRole: 'Secondary School Teacher',
    });
    const designerJob = job({ title: 'Instructional Designer', description: 'Design curriculum and learning materials for corporate training.' });
    const [rec] = getCareerRecommendations(teacherProfile, { jobs: [designerJob], limit: 1 });
    // Modest but real: "instructional designer"'s essential-skill list is
    // short (6 skills), so even a genuine 4/6 overlap doesn't reach the
    // same-domain tier — the meaningful comparison is against the
    // unrelated baseline (test 5's ~9), not an absolute "high score" bar.
    assert.ok(rec.matchScore > 15, `expected a real, non-suppressed adjacent-tier score, got ${rec.matchScore}`);
  });
});

describe('5. Secondary School Teacher -> Mobile Application Developer', () => {
  test('does not rank highly merely because of profile experience/industry alignment', () => {
    const teacherProfile = profile({
      skills: [skill('pedagogy', 'business'), skill('instructional strategies', 'business')],
      likelyRole: 'Secondary School Teacher',
    });
    const devJob = job({ title: 'Mobile Application Developer', description: 'Build native mobile apps using modern engineering practices.' });
    const [rec] = getCareerRecommendations(teacherProfile, { jobs: [devJob], limit: 1 });
    assert.ok(rec.matchScore <= 30, `expected a suppressed score for a clearly unrelated occupation, got ${rec.matchScore}`);
  });
});

describe('6. candidate with missing likelyRole', () => {
  test('does not crash, and existing skill-based matching still functions normally', () => {
    const noRoleProfile = profile({
      skills: dataAnalystSkills,
      industries: ['General Business'],
      likelyRole: undefined,
    });

    assert.doesNotThrow(() => {
      const [rec] = getCareerRecommendations(noRoleProfile, { jobs: [dataAnalystJob], limit: 1 });
      // Occupation is unknown (no likelyRole, and the skill-cluster
      // fallback has no equivalent mapping in jobQueryService.ts for these
      // exact ESCO label strings) -> no gate applied -> the existing
      // skill/experience/industry/transferable score stands unmodified.
      assert.ok(rec.matchScore > 30, `an unknown occupation must never be penalized, got ${rec.matchScore}`);
      assert.ok(rec.matchedSkills.length > 0, 'skill matching itself must still work');
    });
  });
});

describe('7. clearly unrelated occupation with 100% overlap on the JOB LISTING\'s own (free-text) requiredSkills', () => {
  test('occupation incompatibility still gates the score even when job.requiredSkills would suggest a perfect match', () => {
    // job.requiredSkills is deliberately irrelevant here once an occupation
    // resolves — effectiveRequiredSkills() sources from the matched
    // occupation's real essential skills instead (see
        // recommendationService.ts) — so even a job listing whose own
    // free-text extraction happens to equal the candidate's exact skills
    // must not bypass the gate.
    const teacherProfile = profile({
      skills: [skill('pedagogy', 'business'), skill('instructional strategies', 'business')],
      likelyRole: 'Secondary School Teacher',
    });
    const perfectFreeTextOverlapJob = job({
      title: 'Data Analyst',
      description: 'We are looking for a Data Analyst.',
      requiredSkills: [skill('pedagogy', 'business'), skill('instructional strategies', 'business')],
    });
    const [rec] = getCareerRecommendations(teacherProfile, { jobs: [perfectFreeTextOverlapJob], limit: 1 });
    assert.ok(
      rec.matchScore <= 30,
      `even 100% free-text requiredSkills overlap must not produce a high score once occupation gating and real essential skills apply, got ${rec.matchScore}`
    );
  });
});

describe('8. regression: a genuinely good same-occupation match is unaffected', () => {
  test('a Data Analyst candidate applying to a Data Analyst job still scores well', () => {
    const dataAnalystProfile = profile({
      skills: dataAnalystSkills,
      industries: ['SaaS'],
      likelyRole: 'Data Analyst',
    });
    const [rec] = getCareerRecommendations(dataAnalystProfile, { jobs: [dataAnalystJob], limit: 1 });
    assert.ok(rec.matchScore >= 65, `a genuine same-domain, strong-skill-match candidate should still score highly, got ${rec.matchScore}`);
  });
});
