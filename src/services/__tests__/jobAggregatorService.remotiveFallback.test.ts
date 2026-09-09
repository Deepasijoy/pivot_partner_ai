import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchJobs } from '../jobAggregatorService';

// Remotive is a fallback-only source (jobAggregatorService.ts's Phase 2):
// it must be queried ONLY when every other provider (Adzuna, Arbeitnow,
// JSearch, Himalayas — "Phase 1") returns zero combined jobs after geo
// filtering and dedup, and never called at all when Phase 1 already found
// something, even just one job. This is the one piece of behavior none of
// the other aggregator test files exercise (they were written/updated
// assuming Remotive either never runs alongside a working Phase 1 provider,
// or is the sole survivor when every Phase 1 provider fails) — these tests
// assert the actual gating decision directly, by tracking whether
// Remotive's own endpoint was ever hit.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('searchJobs — Remotive fallback gating', () => {
  test('Remotive is NOT called when another provider already returned a job', async () => {
    let remotiveCalled = false;

    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('remotive.com')) {
        remotiveCalled = true;
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 1,
                url: 'https://remotive.com/jobs/1',
                title: 'Remote Data Analyst',
                company_name: 'Should Never Appear Co',
                candidate_required_location: 'Worldwide',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      if (href.includes('/api/jobs/himalayas')) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'real-job',
                company_name: 'Real Co',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'https://arbeitnow.com/jobs/real-job',
                location: 'Anywhere',
                created_at: 1_700_000_000,
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
    assert.equal(remotiveCalled, false, 'Remotive must never be fetched when Phase 1 already found a job');
    assert.ok(!result.providerResults.some((r) => r.source === 'remotive'), 'Remotive must not appear in providerResults when it was never called');
    assert.ok(!result.jobs.some((j) => j.company === 'Should Never Appear Co'), "Remotive's job must not leak into the result");
  });

  test('Remotive IS called and its results are used when every other provider returns zero combined jobs', async () => {
    let remotiveCalled = false;

    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('remotive.com')) {
        remotiveCalled = true;
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 2,
                url: 'https://remotive.com/jobs/2',
                title: 'Remote Data Analyst',
                company_name: 'Fallback Co',
                candidate_required_location: 'Worldwide',
                description: 'Analyze data as a last resort.',
              },
            ],
          }),
          { status: 200 }
        );
      }
      // Every Phase 1 provider genuinely runs and genuinely finds nothing —
      // not a failure, a real "zero results" response — proving the
      // fallback triggers on an empty COUNT, not just on provider errors.
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ status: 'OK', data: [] }), { status: 200 });
      if (href.includes('/api/jobs/himalayas')) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(remotiveCalled, true, 'Remotive must be fetched once every other provider comes back empty');
    assert.equal(result.source, 'live', "Remotive's own result must be treated as a genuine live result, not empty/error");
    assert.ok(result.jobs.some((j) => j.company === 'Fallback Co'));

    const remotiveResult = result.providerResults.find((r) => r.source === 'remotive');
    assert.ok(remotiveResult);
    assert.equal(remotiveResult?.ok, true);
  });

  test('Remotive is called as a last resort even when every Phase 1 provider outright fails (not just returns zero)', async () => {
    let remotiveCalled = false;

    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('remotive.com')) {
        remotiveCalled = true;
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 3,
                url: 'https://remotive.com/jobs/3',
                title: 'Remote Data Analyst',
                company_name: 'Last Resort Co',
                candidate_required_location: 'Worldwide',
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(remotiveCalled, true);
    assert.equal(result.source, 'live');
    assert.ok(result.jobs.some((j) => j.company === 'Last Resort Co'));
  });

  test('Remotive is never called for a local/hybrid search, even when every primary provider returns zero — it respects its own supports() gate', async () => {
    let remotiveCalled = false;

    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('remotive.com')) {
        remotiveCalled = true;
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ status: 'OK', data: [] }), { status: 200 });
      if (href.includes('/api/jobs/himalayas')) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCity: 'Berlin',
      destinationCountry: 'de',
      destinationCountryName: 'Germany',
      workModel: 'local',
    });

    assert.equal(remotiveCalled, false, 'Remotive (remote-only) must never be called for a local search, even with zero results elsewhere');
    assert.equal(result.source, 'empty', 'a genuine zero-results local search is "empty", not "error"');
  });
});
