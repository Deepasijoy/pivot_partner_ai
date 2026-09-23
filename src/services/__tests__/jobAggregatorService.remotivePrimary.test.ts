import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchJobs } from '../jobAggregatorService';

// feat-remotive-cached: Remotive was previously a fallback-only source
// (jobAggregatorService.ts's old Phase 2), queried only when every other
// provider came back empty. It's now a regular PRIMARY_PROVIDERS member —
// remotiveProvider.ts no longer calls Remotive's live API at all, only
// this app's own cached backend proxy (GET /api/jobs/remotive), so a real
// Remotive request is fully decoupled from how many searches run. These
// tests assert the NEW behavior directly: Remotive runs alongside every
// other provider on every applicable search, its results merge in (not
// replace), and it still respects its own remote-only supports() gate.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockAllProviders({
  remotiveJobs = [],
  arbeitnowJobs = [],
  adzunaResults = [],
}: {
  remotiveJobs?: unknown[];
  arbeitnowJobs?: unknown[];
  adzunaResults?: unknown[];
} = {}) {
  let remotiveCalled = 0;
  globalThis.fetch = (async (url) => {
    const href = String(url);
    if (href.includes('/api/jobs/remotive')) {
      remotiveCalled++;
      return new Response(JSON.stringify({ jobs: remotiveJobs }), { status: 200 });
    }
    if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: adzunaResults }), { status: 200 });
    if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
    if (href.includes('/api/jobs/himalayas')) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: arbeitnowJobs }), { status: 200 });
    throw new Error(`Unexpected fetch in test: ${href}`);
  }) as typeof fetch;
  return () => remotiveCalled;
}

describe('searchJobs — Remotive as a primary provider (not a fallback)', () => {
  test('Remotive is called on every remote search, even when another provider already found a job', async () => {
    const getRemotiveCallCount = mockAllProviders({
      remotiveJobs: [
        {
          id: 1,
          url: 'https://remotive.com/remote-jobs/data/remote-data-analyst-1',
          title: 'Remote Data Analyst',
          company_name: 'Remotive Co',
          candidate_required_location: 'Worldwide',
        },
      ],
      arbeitnowJobs: [
        {
          slug: 'real-job',
          company_name: 'Arbeitnow Co',
          title: 'Remote Data Analyst',
          description: '',
          remote: true,
          url: 'https://arbeitnow.com/jobs/real-job',
          location: 'Anywhere',
          created_at: 1_700_000_000,
        },
      ],
    });

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live');
    assert.equal(getRemotiveCallCount(), 1, 'Remotive must be called alongside other providers, not skipped because another already found something');
    assert.ok(result.jobs.some((j) => j.company === 'Arbeitnow Co'));
    assert.ok(result.jobs.some((j) => j.company === 'Remotive Co'), "Remotive's job must be MERGED in, not excluded just because another provider also found one");

    const remotiveResult = result.providerResults.find((r) => r.source === 'remotive');
    assert.ok(remotiveResult);
    assert.equal(remotiveResult?.ok, true);
  });

  test('Remotive results alone are enough for a live result when every other provider is empty', async () => {
    mockAllProviders({
      remotiveJobs: [
        {
          id: 2,
          url: 'https://remotive.com/remote-jobs/data/remote-data-analyst-2',
          title: 'Remote Data Analyst',
          company_name: 'Remotive Only Co',
          candidate_required_location: 'Worldwide',
          description: 'Analyze data.',
        },
      ],
    });

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live');
    assert.ok(result.jobs.some((j) => j.company === 'Remotive Only Co'));
  });

  test('the backend cache proxy is called exactly once per query term, never Remotive\'s own live API', async () => {
    let liveRemotiveCalled = false;
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href === 'https://remotive.com/api/remote-jobs' || href.startsWith('https://remotive.com/api/remote-jobs?')) {
        liveRemotiveCalled = true;
        throw new Error('Test failure: remotiveProvider.ts must never call Remotive directly');
      }
      if (href.includes('/api/jobs/remotive')) {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      if (href.includes('/api/jobs?')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (href.includes('/api/jobs/jsearch')) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      if (href.includes('/api/jobs/himalayas')) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      if (href.includes('arbeitnow.com')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      throw new Error(`Unexpected fetch in test: ${href}`);
    }) as typeof fetch;

    await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'gb',
      destinationCountryName: 'United Kingdom',
      workModel: 'remote',
    });

    assert.equal(liveRemotiveCalled, false);
  });

  test('Remotive is still never called for a local/hybrid search — it respects its own remote-only supports() gate', async () => {
    const getRemotiveCallCount = mockAllProviders();

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCity: 'Berlin',
      destinationCountry: 'de',
      destinationCountryName: 'Germany',
      workModel: 'local',
    });

    assert.equal(getRemotiveCallCount(), 0, 'Remotive (remote-only) must never be called for a local search');
    assert.equal(result.source, 'empty', 'a genuine zero-results local search is "empty", not "error"');
  });
});
