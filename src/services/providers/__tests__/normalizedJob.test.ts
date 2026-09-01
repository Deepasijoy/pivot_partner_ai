import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapArbeitnowJob, type ArbeitnowJob } from '../arbeitnowProvider';

// Regression test for the audit's NormalizedJob.raw finding: `raw` was
// traced across the whole codebase and confirmed set by all four provider
// adapters but never read anywhere (not by jobAggregatorService.ts's
// mapping boundary, not by any component, not by any service) — so it was
// removed from the NormalizedJob type and from every adapter's mapping
// function, rather than kept "for future use" per the audit's own
// recommendation. This test exercises one representative mapper
// (Arbeitnow's — a pure function needing no network mocking) and asserts
// its output carries no `raw` property, so a future re-introduction of
// `raw: job` would fail this test rather than silently reappearing.

describe('mapArbeitnowJob — NormalizedJob no longer carries the raw provider payload', () => {
  const fixture: ArbeitnowJob = {
    slug: 'senior-data-analyst-acme',
    company_name: 'Acme Corp',
    title: 'Senior Data Analyst',
    description: '<p>Great role</p>',
    remote: true,
    url: 'https://arbeitnow.com/jobs/senior-data-analyst-acme',
    tags: ['data', 'sql'],
    job_types: ['Full-time'],
    location: 'Berlin, Germany',
    created_at: 1_700_000_000,
  };

  test('the mapped NormalizedJob has no "raw" key at all', () => {
    const normalized = mapArbeitnowJob(fixture);
    assert.equal('raw' in normalized, false);
    assert.equal(Object.keys(normalized).includes('raw'), false);
  });

  test('every other expected field is still mapped correctly', () => {
    const normalized = mapArbeitnowJob(fixture);
    assert.equal(normalized.id, 'arbeitnow_senior-data-analyst-acme');
    assert.equal(normalized.title, 'Senior Data Analyst');
    assert.equal(normalized.company, 'Acme Corp');
    assert.equal(normalized.workModel, 'remote');
    assert.equal(normalized.applicationUrl, fixture.url);
  });
});
