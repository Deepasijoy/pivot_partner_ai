import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiContext } from '../aiContextService';
import type { ResumeProfile, Skill } from '../../types';
import type { JobFetchResult } from '../jobService';

// Exercises the real buildAiContext() — the exact function that produces
// the system-message context every Career & Income-aware chat turn sends
// to Groq (both the general copilot and, since this task wires it in, the
// per-job "Ask AI" button) — so these tests prove the grounding evidence
// and instructions actually reach the AI, not just that some other module
// computes them correctly in isolation.

function skill(name: string, category: Skill['category'] = 'technical'): Skill {
  return { name, category, demandLevel: 'high', proficiency: 70 };
}

function profile(overrides: Partial<ResumeProfile>): ResumeProfile {
  return { skills: [], experience: '', yearsExperience: 5, industries: [], ...overrides };
}

const baseInput = {
  origin: 'Mumbai',
  destination: 'Berlin, Germany',
  moveTiming: '2026-03',
  workSituation: 'Employed, need to transition',
  preferredWorkModel: 'remote' as const,
  careerWorkModels: [],
};

describe('buildAiContext — evidence grounding (5, 6)', () => {
  test('5. contains the computed match evidence — score, matched skills, missing skills, occupation fit', () => {
    const marineBiologist = profile({
      skills: [skill('Python'), skill('SQL')],
      industries: ['Marine Science'],
      likelyRole: 'Marine Biologist',
    });
    const careerJobs: JobFetchResult = {
      source: 'live',
      jobs: [
        {
          id: 'job_1',
          // Deliberately NOT an exact/partial ESCO occupation label match —
          // confirmed "Environmental Data Analyst" resolves via ESCO (it
          // contains "data analyst" as a substring), which would replace
          // this test's own requiredSkills fixture with the real occupation's
          // 29 real essential skills (see recommendationService.ts's
          // effectiveRequiredSkills()). This title is confirmed unresolved,
          // so job.requiredSkills below stays authoritative, which is what
          // this test (buildAiContext's formatting) is actually about.
          title: 'Coastal Conservation Support Specialist Role',
          company: 'Acme Corp',
          salaryRange: '70000-90000',
          timezone: 'Remote',
          matchScore: 0,
          requiredSkills: [skill('Python'), skill('SQL'), skill('GIS'), skill('Statistics')],
          matchedSkills: [],
          missingSkills: [],
          description: 'Analyze environmental datasets using GIS and statistics.',
          employmentMatch: 0,
        },
      ],
    };

    const context = buildAiContext({ ...baseInput, profile: marineBiologist, careerJobs });

    assert.match(context, /Coastal Conservation Support Specialist Role/);
    assert.match(context, /% match/);
    assert.match(context, /has: Python, SQL/);
    // The occupation-fit note must be present so the AI has grounded
    // language for the transition, rather than inventing its own framing —
    // here 'unknown' (candidate's own occupation doesn't resolve to a real
    // ESCO occupation) is the honest classification, not a guessed 'adjacent'.
    assert.match(context, /occupation fit not determined from available evidence/i);
  });

  test('6. instructs the AI not to invent skills/requirements/courses when real evidence is present', () => {
    const dataAnalyst = profile({
      skills: [skill('Python'), skill('SQL')],
      likelyRole: 'Data Analyst',
    });
    const careerJobs: JobFetchResult = {
      source: 'live',
      jobs: [
        {
          id: 'job_2',
          title: 'Data Analyst',
          company: 'Acme Corp',
          salaryRange: '80000-100000',
          timezone: 'Remote',
          matchScore: 0,
          requiredSkills: [skill('Python'), skill('SQL')],
          matchedSkills: [],
          missingSkills: [],
          description: 'Analyze data.',
          employmentMatch: 0,
        },
      ],
    };

    const context = buildAiContext({ ...baseInput, profile: dataAnalyst, careerJobs });

    assert.match(context, /JOB DATA EVIDENCE RULES/);
    assert.match(context, /already computed by the application/i);
    assert.match(context, /never invent a course title/i);
    assert.match(context, /not calculate.*different match percentage/i);
  });

  test('the evidence-rules section is omitted when there is nothing to ground (no recommendations/paths produced)', () => {
    // A profile with no skills and no jobs to guide against produces no
    // real recommendations — the instructional section should not appear
    // with nothing for it to apply to (still exercises the real function,
    // not a hand-picked always-true case).
    const emptyProfile = profile({});
    const context = buildAiContext({ ...baseInput, profile: emptyProfile, careerJobs: null });
    assert.doesNotMatch(context, /JOB DATA EVIDENCE RULES/);
  });
});

describe('buildAiContext — missing evidence is handled safely (7)', () => {
  test('no profile and no careerJobs at all does not throw and produces a safe, non-career string', () => {
    assert.doesNotThrow(() => {
      const context = buildAiContext({ ...baseInput, profile: null, careerJobs: null });
      assert.equal(typeof context, 'string');
      assert.doesNotMatch(context, /JOB DATA/);
    });
  });

  test('a profile with no likelyRole/industries does not crash context building', () => {
    assert.doesNotThrow(() => {
      const bareProfile = profile({ skills: [skill('Python')] });
      const context = buildAiContext({ ...baseInput, profile: bareProfile, careerJobs: null });
      assert.equal(typeof context, 'string');
    });
  });

  test('an empty/blank relocation input produces no fabricated relocation lines', () => {
    const context = buildAiContext({
      ...baseInput,
      origin: '',
      destination: '',
      moveTiming: '',
      workSituation: '',
      profile: null,
      careerJobs: null,
    });
    assert.doesNotMatch(context, /Origin:/);
    assert.doesNotMatch(context, /Destination:/);
  });
});
