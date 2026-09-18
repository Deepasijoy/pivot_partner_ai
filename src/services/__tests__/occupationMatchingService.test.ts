import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOccupationCompatibility, resolveCandidateOccupation } from '../occupationMatchingService';

// Rewritten for the ESCO/ISCO-based replacement of the old hand-curated
// DOMAIN_FAMILIES keyword system (see occupationMatchingService.ts's own
// module comment for the full design). Every candidate role / job title
// below is a REAL ESCO occupation label, confirmed to resolve via
// escoTaxonomyClient.ts against the actual generated taxonomy — this file
// exercises the real matching path end to end, not a mocked stand-in.

const ADJACENT_MULTIPLIER = 0.85;
const WEAK_EVIDENCE_MULTIPLIER = 0.6;

describe('classifyOccupationCompatibility', () => {
  test('1. Data Analyst candidate vs "Data Analyst" job -> same_domain, no adjustment', () => {
    const result = classifyOccupationCompatibility('Data Analyst', [], 'Data Analyst', 'Analyze data using SQL and Power BI.');
    assert.equal(result.category, 'same_domain');
    assert.equal(result.multiplier, 1);
    assert.equal(result.candidateOccupation?.label, 'data analyst');
    assert.equal(result.jobOccupation?.label, 'data analyst');
  });

  test('2. Data Analyst candidate vs "Business Intelligence Analyst" job -> adjacent (ISCO 25 <-> 24 bridge)', () => {
    // ESCO resolves "Business Intelligence Analyst" to "business
    // intelligence manager" (ISCO 2421, sub-major 24) via its own alt
    // labels — a different ISCO sub-major from "data analyst" (2511,
    // sub-major 25). Without the curated 25<->24 bridge in
    // occupationMatchingService.ts, this would wrongly read as unrelated —
    // exactly the case this sprint exists to get right.
    const result = classifyOccupationCompatibility(
      'Data Analyst',
      [],
      'Business Intelligence Analyst',
      'Build dashboards and reports for stakeholders.'
    );
    assert.equal(result.category, 'adjacent');
    assert.equal(result.multiplier, ADJACENT_MULTIPLIER);
    assert.equal(result.cap, undefined, 'adjacent must not be hard-capped like unrelated');
  });

  test('3. Data Analyst candidate vs "Secondary School Teacher" job -> unrelated, sharply discounted', () => {
    const result = classifyOccupationCompatibility(
      'Data Analyst',
      [],
      'Secondary School Teacher',
      'Teach mathematics to secondary school students.'
    );
    assert.equal(result.category, 'unrelated');
    assert.ok(result.multiplier < 0.5);
    assert.ok(result.cap !== undefined && result.cap <= 30);
  });

  test('4. within-family variant: Software Developer candidate vs "Mobile Application Developer" job -> same_domain (same ISCO minor group 251)', () => {
    const result = classifyOccupationCompatibility('Software Developer', [], 'Mobile Application Developer', 'Build native mobile apps.');
    assert.equal(result.category, 'same_domain');
  });

  test('5. Secondary School Teacher candidate vs "Instructional Designer" job -> adjacent (same ISCO sub-major 23, different minor group)', () => {
    const result = classifyOccupationCompatibility(
      'Secondary School Teacher',
      [],
      'Instructional Designer',
      'Design curriculum and learning materials.'
    );
    assert.equal(result.category, 'adjacent');
  });

  test('6. missing likelyRole and no resolvable skill cluster -> unknown, no adjustment, never crashes', () => {
    assert.doesNotThrow(() => {
      const result = classifyOccupationCompatibility(undefined, ['General Business'], 'Data Analyst', 'Analyze data.');
      assert.equal(result.category, 'unknown');
      assert.equal(result.multiplier, 1);
      assert.equal(result.reason, 'candidate_occupation_unresolved');
      assert.equal(result.candidateOccupation, null);
    });
  });

  test('7. candidate resolves, but the job title/description match no ESCO occupation at all -> unknown, real discount, no hard cap (the confirmed SAP root-cause case)', () => {
    // "Senior SAP AMS Consultant (SAP EWM)" — confirmed during investigation
    // to have no dedicated ESCO occupation, even in the full untrimmed
    // taxonomy. This must get a real discount (not the same confidence as
    // same_domain) but never a hard cap — the old asymmetry, preserved.
    const result = classifyOccupationCompatibility(
      'Data Analyst',
      [],
      'Senior SAP AMS Consultant (SAP EWM)',
      'Provide application management support for SAP Extended Warehouse Management.'
    );
    assert.equal(result.category, 'unknown');
    assert.equal(result.reason, 'job_occupation_unresolved');
    assert.equal(result.multiplier, WEAK_EVIDENCE_MULTIPLIER);
    assert.ok(result.multiplier < ADJACENT_MULTIPLIER, 'must be less confident than a known adjacent transition');
    assert.equal(result.cap, undefined, 'not the same treatment as a confirmed-unrelated job — no hard cap');
  });

  describe('normalization', () => {
    test('case and whitespace are normalized', () => {
      const result = classifyOccupationCompatibility('  DATA analyst  ', [], 'DATA ANALYST', 'Analyze data.');
      assert.equal(result.category, 'same_domain');
    });
  });
});

describe('resolveCandidateOccupation', () => {
  test('resolves directly from likelyRole when it matches a real ESCO occupation', () => {
    const result = resolveCandidateOccupation('Data Analyst', [], []);
    assert.equal(result?.label, 'data analyst');
    assert.equal(result?.iscoGroup, '2511');
  });

  test('falls back to the dominant skill-cluster query term when likelyRole is absent', () => {
    // Reuses jobQueryService.ts's own dominant-cluster resolution — Python +
    // SQL + Power BI is a 3-skill data_analytics majority, so the derived
    // query term ("Senior Data Analyst" for a 10-year-strength profile, or
    // "Data Analyst" otherwise) should resolve to a real ESCO occupation.
    const skills = [
      { name: 'Python', category: 'technical' as const, demandLevel: 'high' as const, proficiency: 80 },
      { name: 'SQL', category: 'technical' as const, demandLevel: 'high' as const, proficiency: 80 },
      { name: 'Power BI', category: 'technical' as const, demandLevel: 'high' as const, proficiency: 80 },
    ];
    const result = resolveCandidateOccupation(undefined, skills, []);
    assert.ok(result, 'expected the skill-cluster fallback to resolve a real ESCO occupation');
    assert.equal(result?.iscoGroup, '2511');
  });

  test('returns null when neither likelyRole nor skills/industries give a resolvable signal — never invented', () => {
    assert.equal(resolveCandidateOccupation(undefined, undefined, undefined), null);
    // Confirmed during the SAP root-cause investigation: ESCO has no
    // dedicated occupation for vendor-specific ERP consulting roles, even
    // in the full untrimmed taxonomy — a genuinely unresolvable title.
    assert.equal(resolveCandidateOccupation('Senior SAP AMS Consultant (SAP EWM)', [], ['General Business']), null);
  });
});
