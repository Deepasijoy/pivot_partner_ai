import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchJobs } from '../jobAggregatorService';

// Aggregator-level integration tests for the new Himalayas provider —
// proving it participates in the EXISTING shared pipeline (dedup, provider
// isolation) with zero Himalayas-specific special-casing, per the task's
// explicit "do not create Himalayas-specific deduplication" /
// "do not duplicate global geo logic" instructions.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('searchJobs — Himalayas jobs enter the existing deduplication pipeline (16)', () => {
  test('the same underlying vacancy returned by both Himalayas and Remotive collapses to one via the existing title+company+description fingerprint', async () => {
    const sharedDescription =
      'We are hiring a Remote Data Analyst to join our fully distributed team, working across dashboards and reporting pipelines.';

    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (href.includes('remotive.com')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 1,
                url: 'https://remotive.com/jobs/1',
                title: 'Remote Data Analyst',
                company_name: 'Duplicate Co',
                candidate_required_location: 'Worldwide',
                description: sharedDescription,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('/api/jobs/himalayas')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                guid: 'him-1',
                title: 'Remote Data Analyst',
                companyName: 'Duplicate Co',
                description: sharedDescription,
                applicationLink: 'https://himalayas.app/jobs/him-1',
                locationRestrictions: [],
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live');
    const duplicateCoJobs = result.jobs.filter((j) => j.company === 'Duplicate Co');
    assert.equal(duplicateCoJobs.length, 1, 'the same vacancy from two providers must collapse to one via the existing dedup pipeline, with no Himalayas-specific logic');
  });

  test('genuinely different jobs from Himalayas and another provider are both kept', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (href.includes('remotive.com')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 2,
                url: 'https://remotive.com/jobs/2',
                title: 'Remote Data Analyst',
                company_name: 'Remotive Only Co',
                candidate_required_location: 'Worldwide',
                description: 'A completely different opening at a completely different company.',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('/api/jobs/himalayas')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                guid: 'him-2',
                title: 'Remote Data Analyst',
                companyName: 'Himalayas Only Co',
                description: 'Yet another genuinely distinct opening.',
                applicationLink: 'https://himalayas.app/jobs/him-2',
                locationRestrictions: [],
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.ok(result.jobs.some((j) => j.company === 'Remotive Only Co'));
    assert.ok(result.jobs.some((j) => j.company === 'Himalayas Only Co'));
  });
});

describe('searchJobs — Himalayas failure does not prevent the other four providers\' results (19)', () => {
  test('Himalayas persistently failing still allows Adzuna, Arbeitnow, Remotive, and JSearch to contribute live results', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);

      if (href.includes('/api/jobs/himalayas')) {
        throw new TypeError('Failed to fetch');
      }
      if (href.includes('/api/jobs?')) {
        return new Response(
          JSON.stringify({ results: [{ id: 1, title: 'Adzuna Analyst', company: { display_name: 'Adzuna Co' }, created: new Date().toISOString() }] }),
          { status: 200 }
        );
      }
      if (href.includes('/api/jobs/jsearch')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                job_id: 'js-1',
                job_title: 'JSearch Analyst',
                employer_name: 'JSearch Co',
                job_is_remote: true,
                job_posted_at_datetime_utc: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'arbeitnow-analyst',
                company_name: 'Arbeitnow Co',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'https://arbeitnow.com/jobs/arbeitnow-analyst',
                location: 'Anywhere',
                created_at: Math.floor(Date.now() / 1000),
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('remotive.com')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 9,
                url: 'https://remotive.com/jobs/9',
                title: 'Remote Data Analyst',
                company_name: 'Remotive Co',
                candidate_required_location: 'Worldwide',
                description: 'Analyze data.',
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live', 'four healthy providers must still yield a live result despite Himalayas failing');
    const companies = result.jobs.map((j) => j.company);
    assert.ok(companies.includes('Adzuna Co'));
    assert.ok(companies.includes('JSearch Co'));
    assert.ok(companies.includes('Arbeitnow Co'));
    assert.ok(companies.includes('Remotive Co'));

    const himalayasResult = result.providerResults.find((r) => r.source === 'himalayas');
    assert.equal(himalayasResult?.ok, false);
  });
});
