import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateJobs } from '../jobAggregatorService';
import type { NormalizedJob } from '../providers/types';

// Step E regression: QA confirmed the exact same live Marketing job
// ("German-Speaking Digital Marketing Sales Executive Barcelona" at
// Nordicrecruiters) rendered 3 times in Remote results. Root cause,
// confirmed by querying the real Adzuna proxy directly: a recruiter
// cross-posted the identical remote vacancy under several different German
// cities — same title, company, and description, but a different
// `location.display_name` and a different redirect/application URL per
// city-tagged copy — so neither of the two existing dedup passes (exact
// URL, then title+company+location fingerprint) collapsed them.

function job(overrides: Partial<NormalizedJob>): NormalizedJob {
  return {
    id: `job_${Math.random().toString(36).slice(2)}`,
    source: 'adzuna',
    sourceJobId: 'x',
    title: 'Untitled Role',
    company: 'Acme Corp',
    description: '',
    location: 'Somewhere',
    workModel: 'unknown',
    ...overrides,
  };
}

const REMOTE_MARKETING_DESCRIPTION =
  'We are looking for a German-speaking Digital Marketing Sales Executive to join our fully remote team. ' +
  'You will drive B2B sales across the DACH region, manage client relationships, and report directly to the ' +
  'Head of Sales. Fluent German and English required.';

describe('deduplicateJobs — identical application URL (unchanged behavior)', () => {
  test('two entries with the exact same application URL collapse to one, regardless of work model', () => {
    const jobs = [
      job({ id: 'a', title: 'Backend Engineer', company: 'Acme', applicationUrl: 'https://adzuna.de/details/123' }),
      job({ id: 'b', title: 'Backend Engineer (copy)', company: 'Acme Corp GmbH', applicationUrl: 'https://adzuna.de/details/123' }),
    ];
    assert.equal(deduplicateJobs(jobs, 'local').length, 1);
    assert.equal(deduplicateJobs(jobs, 'remote').length, 1);
  });
});

describe('deduplicateJobs — same title/company/location with different URLs (unchanged behavior)', () => {
  test('local/hybrid: identical title+company+location still collapses even with different URLs', () => {
    const jobs = [
      job({ id: 'a', title: 'Data Analyst', company: 'Acme', location: 'Berlin, Germany', applicationUrl: 'https://x.test/1' }),
      job({ id: 'b', title: 'Data Analyst', company: 'Acme', location: 'Berlin, Germany', applicationUrl: 'https://x.test/2' }),
    ];
    assert.equal(deduplicateJobs(jobs, 'local').length, 1);
  });
});

describe('deduplicateJobs — the confirmed provider-duplicate case (Step E fix)', () => {
  test('remote: the same vacancy cross-posted under different cities, with different URLs, now collapses to one', () => {
    const jobs = [
      job({
        id: 'adzuna_5786642861',
        title: 'German-Speaking Digital Marketing Sales Executive Barcelona',
        company: 'Nordicrecruiters',
        description: REMOTE_MARKETING_DESCRIPTION,
        location: 'Mülheim an der Ruhr, Nordrhein-Westfalen',
        applicationUrl: 'https://www.adzuna.de/details/5786642861',
        workModel: 'unknown',
      }),
      job({
        id: 'adzuna_5786642877',
        title: 'German-Speaking Digital Marketing Sales Executive Barcelona',
        company: 'Nordicrecruiters',
        description: REMOTE_MARKETING_DESCRIPTION,
        location: 'Nürnberg, Bayern',
        applicationUrl: 'https://www.adzuna.de/details/5786642877',
        workModel: 'unknown',
      }),
    ];

    const remoteResult = deduplicateJobs(jobs, 'remote');
    assert.equal(remoteResult.length, 1, 'the two city-tagged copies of the same remote vacancy must collapse to one');
  });

  test('local: the previous fix does not apply — this was never the reported bug\'s context, and location still legitimately distinguishes local postings', () => {
    const jobs = [
      job({
        id: 'a',
        title: 'German-Speaking Digital Marketing Sales Executive Barcelona',
        company: 'Nordicrecruiters',
        description: REMOTE_MARKETING_DESCRIPTION,
        location: 'Mülheim an der Ruhr, Nordrhein-Westfalen',
        applicationUrl: 'https://www.adzuna.de/details/1',
      }),
      job({
        id: 'b',
        title: 'German-Speaking Digital Marketing Sales Executive Barcelona',
        company: 'Nordicrecruiters',
        description: REMOTE_MARKETING_DESCRIPTION,
        location: 'Nürnberg, Bayern',
        applicationUrl: 'https://www.adzuna.de/details/2',
      }),
    ];
    // Local/hybrid dedup is unchanged by Step E — location is still part
    // of the fingerprint there, so these are (correctly, for a local
    // search) treated as two distinct real-office postings.
    assert.equal(deduplicateJobs(jobs, 'local').length, 2);
  });
});

describe('deduplicateJobs — genuinely different remote jobs must NOT be incorrectly merged', () => {
  test('same title and company, but a materially different description -> kept as two distinct jobs', () => {
    const jobs = [
      job({
        id: 'a',
        title: 'Customer Support Specialist',
        company: 'Globex',
        description:
          'Support our EU customers via chat and email, working closely with the billing team to resolve payment disputes.',
        location: 'Remote - Germany',
        applicationUrl: 'https://x.test/a',
      }),
      job({
        id: 'b',
        title: 'Customer Support Specialist',
        company: 'Globex',
        description:
          'Support our APAC customers via phone, triaging technical escalations for our enterprise hardware product line.',
        location: 'Remote - Singapore',
        applicationUrl: 'https://x.test/b',
      }),
    ];
    assert.equal(
      deduplicateJobs(jobs, 'remote').length,
      2,
      'two genuinely different openings sharing a title/company must not collapse just because both are remote'
    );
  });

  test('same title/company, no usable description on either side -> falls back to the location key, still distinguished', () => {
    const jobs = [
      job({ id: 'a', title: 'Support Engineer', company: 'Globex', description: '', location: 'Remote - Germany', applicationUrl: 'https://x.test/a' }),
      job({ id: 'b', title: 'Support Engineer', company: 'Globex', description: '', location: 'Remote - France', applicationUrl: 'https://x.test/b' }),
    ];
    assert.equal(deduplicateJobs(jobs, 'remote').length, 2);
  });
});
