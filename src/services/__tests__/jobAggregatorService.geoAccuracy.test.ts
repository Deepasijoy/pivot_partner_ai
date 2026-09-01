import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterByDestination, searchJobs } from '../jobAggregatorService';
import type { NormalizedJob } from '../providers/types';

// filterByDestination is a pure, synchronous function — exercised directly
// with real NormalizedJob fixtures, no network involved. searchJobs() is
// exercised end to end against a stubbed global fetch for the two
// integration-level requirements (11, 12).

function remoteJob(overrides: Partial<NormalizedJob>): NormalizedJob {
  return {
    id: 'remotive_1',
    source: 'remotive',
    sourceJobId: '1',
    title: 'Data Analyst',
    company: 'Acme Corp',
    description: 'Analyze things.',
    location: 'Remote',
    workModel: 'remote',
    ...overrides,
  };
}

const FRANCE_REMOTE_PARAMS = {
  what: 'Data Analyst',
  destinationCountry: 'fr',
  destinationCountryName: 'France',
  workModel: 'remote' as const,
};

describe('filterByDestination — remote eligibility classification', () => {
  test('6. a remote job explicitly eligible for the destination country is kept and marked confirmed', () => {
    const job = remoteJob({ remoteEligibility: 'Open to candidates in France' });
    const [result] = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.ok(result);
    assert.equal(result.remoteEligibilityStatus, 'confirmed');
  });

  test('6b. a structured country field matching the destination is kept and marked confirmed', () => {
    const job = remoteJob({ country: 'fr' });
    const [result] = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.ok(result);
    assert.equal(result.remoteEligibilityStatus, 'confirmed');
  });

  test('7. a remote job explicitly eligible worldwide is kept and marked confirmed', () => {
    const job = remoteJob({ remoteEligibility: 'Worldwide' });
    const [result] = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.ok(result);
    assert.equal(result.remoteEligibilityStatus, 'confirmed');
  });

  test('8. a remote job explicitly restricted to a different country is excluded entirely', () => {
    const job = remoteJob({ remoteEligibility: 'United States only' });
    const result = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.equal(result.length, 0);
  });

  test('8b. a structured country field naming a different country is excluded entirely', () => {
    const job = remoteJob({ country: 'us' });
    const result = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.equal(result.length, 0);
  });

  test('9. a remote job with no eligibility/location signal at all is retained and marked unclear, never dropped', () => {
    const job = remoteJob({ remoteEligibility: undefined, country: undefined });
    const [result] = filterByDestination([job], FRANCE_REMOTE_PARAMS);
    assert.ok(result, 'a job with no signal must never be silently dropped');
    assert.equal(result.remoteEligibilityStatus, 'unclear');
  });

  test('10. a job explicitly tagged local/hybrid never qualifies as a remote result', () => {
    const localJob = remoteJob({ workModel: 'local', remoteEligibility: 'Worldwide' });
    const hybridJob = remoteJob({ id: 'remotive_2', workModel: 'hybrid', remoteEligibility: 'Worldwide' });
    const result = filterByDestination([localJob, hybridJob], FRANCE_REMOTE_PARAMS);
    assert.equal(result.length, 0, 'local/hybrid-tagged jobs must never surface in a remote search');
  });
});

describe('filterByDestination — local/hybrid unaffected by remote-eligibility logic', () => {
  test('a local job still requires a genuine city/region match, unaffected by the new eligibility field', () => {
    const montpellierJob: NormalizedJob = {
      id: 'arbeitnow_1',
      source: 'arbeitnow',
      sourceJobId: '1',
      title: 'Data Analyst',
      company: 'Acme Corp',
      description: '',
      location: 'Montpellier, France',
      workModel: 'local',
    };
    const parisJob: NormalizedJob = { ...montpellierJob, id: 'arbeitnow_2', location: 'Paris, France' };

    const result = filterByDestination([montpellierJob, parisJob], {
      what: 'Data Analyst',
      destinationCity: 'Montpellier',
      destinationCountry: 'fr',
      workModel: 'local',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'arbeitnow_1');
    assert.equal(result[0].remoteEligibilityStatus, undefined, 'eligibility status is meaningless for local jobs');
  });
});

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('searchJobs — destination-country filtering integration (11, 12)', () => {
  test('11. a country unsupported by Adzuna still returns live jobs from the other providers, Adzuna simply skipped', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = (async (url) => {
      const href = String(url);
      calledUrls.push(href);

      if (href.includes('/api/jobs/jsearch')) {
        return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      }
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'remote-data-analyst',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: 'x',
                remote: true,
                url: 'https://arbeitnow.com/jobs/remote-data-analyst',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('remotive.com')) {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;

    // Japan is not in adzunaProvider.ts's ADZUNA_SUPPORTED_COUNTRY_CODES.
    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'jp',
      destinationCountryName: 'Japan',
      workModel: 'remote',
    });

    assert.ok(
      !calledUrls.some((url) => url.includes('/api/jobs?')),
      'Adzuna must be skipped entirely for an unsupported country, not called and failed'
    );
    assert.equal(result.source, 'live');
    assert.ok(result.jobs.length >= 1);
    assert.ok(!result.providerResults.some((r) => r.source === 'adzuna'), 'adzuna should not even appear in providerResults — supports() excluded it');
  });

  test('12. one provider failing does not prevent the others from returning jobs (provider isolation intact)', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('/api/jobs?')) throw new TypeError('Failed to fetch');
      if (href.includes('/api/jobs/jsearch')) {
        return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      }
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'remote-data-analyst',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: 'x',
                remote: true,
                url: 'https://arbeitnow.com/jobs/remote-data-analyst',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (href.includes('remotive.com')) {
        return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
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
    assert.ok(result.jobs.length >= 1);
    const adzunaResult = result.providerResults.find((r) => r.source === 'adzuna');
    assert.equal(adzunaResult?.ok, false);
    const arbeitnowResult = result.providerResults.find((r) => r.source === 'arbeitnow');
    assert.equal(arbeitnowResult?.ok, true);
  });
});
