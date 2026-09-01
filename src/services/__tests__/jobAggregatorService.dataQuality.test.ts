import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchJobs } from '../jobAggregatorService';
import { isSafeExternalUrl } from '../../utils/urlSafety';

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('searchJobs — freshness sorting end to end (2, 3, 4)', () => {
  test('a recent job, a stale job, and a dateless job all survive — sorted recent-first, unknown-date last', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('/api/jobs?')) {
        return new Response(
          JSON.stringify({
            results: [{ id: 1, title: 'Stale Data Analyst', company: { display_name: 'Old Co' }, created: daysAgoIso(400) }],
          }),
          { status: 200 }
        );
      }
      if (href.includes('/api/jobs/jsearch')) {
        return new Response(JSON.stringify({ error: 'not_configured' }), { status: 501 });
      }
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'unknown-date',
                company_name: 'Unknown Co',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'https://example.com/unknown',
                location: 'Anywhere',
                created_at: 0,
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
                id: 99,
                url: 'https://example.com/recent',
                title: 'Recent Remote Analyst',
                company_name: 'New Co',
                publication_date: daysAgoIso(1),
                candidate_required_location: 'Worldwide',
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'fr',
      destinationCountryName: 'France',
      workModel: 'remote',
    });

    assert.equal(result.source, 'live');
    assert.equal(result.jobs.length, 3, 'nothing is dropped for being stale or dateless');

    const titles = result.jobs.map((j) => j.title);
    assert.equal(titles[0], 'Recent Remote Analyst', 'the recent job sorts first');
    assert.equal(titles[1], 'Stale Data Analyst', 'the stale-but-dated job sorts ahead of the unknown-date one');
    assert.equal(titles[2], 'Remote Data Analyst', 'the unknown-date job (Arbeitnow created_at: 0) sorts last');
  });
});

describe('searchJobs — provider attribution and freshness passthrough (14)', () => {
  test('each job carries its real source provider and raw postedAt through to JobOpportunity', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'attrib-test',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'https://example.com/attrib',
                location: 'Anywhere',
                created_at: Math.floor(Date.now() / 1000) - 86400,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    // Only Arbeitnow supports() unconditionally regardless of destination
    // country coverage — use a country outside ADZUNA_SUPPORTED_COUNTRY_CODES
    // so only Arbeitnow/JSearch attempt, and stub JSearch away by using a
    // destination that still lets it run; simplest is to just inspect the
    // Arbeitnow-sourced job specifically.
    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'jp',
      destinationCountryName: 'Japan',
      workModel: 'remote',
    });

    const arbeitnowJob = result.jobs.find((j) => j.source === 'arbeitnow');
    assert.ok(arbeitnowJob, 'the job\'s real provider source must survive through to JobOpportunity');
    assert.ok(arbeitnowJob?.postedAt, 'the job\'s raw postedAt must survive through to JobOpportunity');
  });
});

describe('searchJobs — shared skill extraction is used for job descriptions (13)', () => {
  test('a job description using an alias term (e.g. "spreadsheets") is detected via the same shared alias table resumes use', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'skill-test',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: 'Strong spreadsheets skills required for this role.',
                remote: true,
                url: 'https://example.com/skills',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'jp',
      destinationCountryName: 'Japan',
      workModel: 'remote',
    });

    const job = result.jobs.find((j) => j.source === 'arbeitnow');
    assert.ok(job);
    const skillNames = job?.requiredSkills.map((s) => s.name) ?? [];
    assert.ok(
      skillNames.includes('Excel'),
      `expected "spreadsheets" to resolve to "Excel" via the shared skillExtractionService alias table, got: ${skillNames.join(', ')}`
    );
  });
});

describe('application URL safety, end to end: provider -> NormalizedJob -> JobOpportunity (11)', () => {
  test('an unsafe applicationUrl from a provider never survives as a safe href downstream', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'unsafe-url',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'javascript:alert(1)',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'jp',
      destinationCountryName: 'Japan',
      workModel: 'remote',
    });

    const job = result.jobs.find((j) => j.source === 'arbeitnow');
    assert.ok(job);
    // The raw value is passed through unmodified (never invented/rewritten)...
    assert.equal(job?.applyUrl, 'javascript:alert(1)');
    // ...but the UI-facing guard must reject it before it ever becomes an href.
    assert.equal(isSafeExternalUrl(job?.applyUrl), false);
  });

  test('a genuine https applicationUrl survives as safe end to end', async () => {
    globalThis.fetch = (async (url) => {
      const href = String(url);
      if (href.includes('arbeitnow.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                slug: 'safe-url',
                company_name: 'Acme',
                title: 'Remote Data Analyst',
                description: '',
                remote: true,
                url: 'https://arbeitnow.com/jobs/safe-url',
                location: 'Anywhere',
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    const result = await searchJobs({
      what: 'Data Analyst',
      destinationCountry: 'jp',
      destinationCountryName: 'Japan',
      workModel: 'remote',
    });

    const job = result.jobs.find((j) => j.source === 'arbeitnow');
    assert.equal(isSafeExternalUrl(job?.applyUrl), true);
  });
});
