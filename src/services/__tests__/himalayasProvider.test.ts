import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { himalayasProvider } from '../providers/himalayasProvider';
import { classifyRemoteEligibility } from '../providers/geoMatch';
import { formatSalary } from '../salaryFormatting';

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockHimalayasResponse(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

// pubDate as Unix seconds and locationRestrictions as plain strings match
// the REAL, live-verified Himalayas API response shape (confirmed via a
// live call to the actual backend route against multiple real queries) —
// not what Himalayas' own docs page claims (ISO 8601 string / {alpha2,
// name, slug} objects). These fixtures use the real observed shape as the
// primary case; a couple of tests below separately cover the
// documented-but-unobserved shape as a defensive fallback.
function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    guid: 'https://himalayas.app/companies/acme-remote/jobs/remote-data-analyst',
    title: 'Remote Data Analyst',
    excerpt: 'Analyze data for a fast-growing startup.',
    companyName: 'Acme Remote',
    description: '<p>Analyze <b>data</b> and build dashboards.</p>',
    applicationLink: 'https://himalayas.app/companies/acme-remote/jobs/remote-data-analyst',
    pubDate: 1788153888, // real observed shape: Unix seconds
    minSalary: 70000,
    maxSalary: 90000,
    salaryPeriod: 'annual',
    currency: 'USD',
    employmentType: 'Full Time',
    locationRestrictions: [],
    categories: ['Data'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Valid response maps correctly / 15. pubDate maps correctly
// ---------------------------------------------------------------------------
describe('himalayasProvider — mapping', () => {
  test('1. a valid response maps every documented field correctly', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob()] });

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);

    const job = result.jobs[0];
    assert.equal(job.id, 'himalayas_https://himalayas.app/companies/acme-remote/jobs/remote-data-analyst');
    assert.equal(job.source, 'himalayas');
    assert.equal(job.sourceJobId, 'https://himalayas.app/companies/acme-remote/jobs/remote-data-analyst');
    assert.equal(job.title, 'Remote Data Analyst');
    assert.equal(job.company, 'Acme Remote');
    assert.equal(job.description, 'Analyze data and build dashboards.', 'sanitized HTML must be stripped to plain text');
    assert.equal(job.applicationUrl, 'https://himalayas.app/companies/acme-remote/jobs/remote-data-analyst');
    assert.equal(job.workModel, 'remote');
    assert.equal(job.employmentType, 'Full Time');
  });

  test('15. pubDate (real API shape: Unix seconds) maps correctly to an ISO postedAt string', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ pubDate: 1788153888 })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.postedAt, new Date(1788153888 * 1000).toISOString());
    assert.ok(job.postedAt?.startsWith('20'), 'must be a real, plausible year, not an epoch-adjacent date from a seconds/milliseconds mixup');
  });

  test('a pubDate that is already milliseconds (or a genuine ISO string, per Himalayas\' own docs) is handled defensively too', async () => {
    const nowMs = Date.now();
    mockHimalayasResponse(200, { jobs: [baseJob({ guid: 'ms-case', pubDate: nowMs })] });
    const msResult = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(msResult.jobs[0].postedAt, new Date(nowMs).toISOString());

    mockHimalayasResponse(200, { jobs: [baseJob({ guid: 'iso-case', pubDate: '2026-08-01T00:00:00.000Z' })] });
    const isoResult = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(isoResult.jobs[0].postedAt, '2026-08-01T00:00:00.000Z');
  });

  test('2. a blank/whitespace-only title is rejected', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ guid: 'blank', title: '   ' }), baseJob({ guid: 'valid', title: 'Remote Data Analyst' })],
    });

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].sourceJobId, 'valid');
  });

  test('company name/description absent falls back honestly, never invented', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ companyName: undefined, description: undefined })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.jobs[0].company, 'Company not listed');
    assert.equal(result.jobs[0].description, '');
  });
});

// ---------------------------------------------------------------------------
// 3, 4, 5, 6, 7. Reliability
// ---------------------------------------------------------------------------
describe('himalayasProvider — reliability', () => {
  test('3. a malformed response (jobs not an array) is a controlled failure, not a crash', async () => {
    mockHimalayasResponse(200, { jobs: 'not-an-array' });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /malformed/i);
    assert.deepEqual(result.jobs, []);
  });

  test('4. a network failure is handled as a controlled failure, never throws', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.doesNotReject(async () => {
      const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
      assert.equal(result.ok, false);
      assert.deepEqual(result.jobs, []);
    });
  });

  test('5. a persistent 5xx receives exactly one bounded retry, then a controlled failure', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'upstream down' }), { status: 502 });
    }) as typeof fetch;

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.equal(calls, 2, 'exactly one original attempt plus one retry');
  });

  test('a transient 5xx that recovers on retry succeeds', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 503 });
      return new Response(JSON.stringify({ jobs: [baseJob()] }), { status: 200 });
    }) as typeof fetch;

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 1);
    assert.equal(calls, 2);
  });

  test('6. a 4xx is never retried', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'bad request' }), { status: 400 });
    }) as typeof fetch;

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.equal(calls, 1, 'a 4xx must not be retried');
  });

  test('7. a 429 is handled cleanly — reported as a failure, never retried into a retry storm', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
    }) as typeof fetch;

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /429/);
    assert.equal(calls, 1, 'retrying a 429 would make the rate-limit problem worse, so it must not be retried');
  });
});

// ---------------------------------------------------------------------------
// 8. Remote-only supports()
// ---------------------------------------------------------------------------
describe('himalayasProvider — supports() (8)', () => {
  test('supports remote searches only', () => {
    assert.equal(himalayasProvider.supports({ what: 'x', workModel: 'remote' }), true);
    assert.equal(himalayasProvider.supports({ what: 'x', workModel: 'local' }), false);
    assert.equal(himalayasProvider.supports({ what: 'x', workModel: 'hybrid' }), false);
  });
});

// ---------------------------------------------------------------------------
// 9, 10, 11, 12. Remote eligibility, via the structured locationRestrictions
// -> free-text -> classifyRemoteEligibility pipeline (no new geo logic).
// ---------------------------------------------------------------------------
describe('himalayasProvider — remote eligibility from locationRestrictions', () => {
  test('9. destination country appears in locationRestrictions (real API shape: plain country-name strings) -> confirmed', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ locationRestrictions: ['Germany'] })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.remoteEligibility, 'Germany');
    assert.equal(classifyRemoteEligibility('Germany', 'de', job.remoteEligibility), 'confirmed');
  });

  test('9b. destination country matches among several real, multi-country restrictions', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ locationRestrictions: ['United States', 'Canada', 'United Kingdom', 'Germany'] })],
    });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(classifyRemoteEligibility('Germany', 'de', result.jobs[0].remoteEligibility), 'confirmed');
  });

  test('9c. the documented-but-unobserved {alpha2, name, slug} object shape is also handled defensively', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ locationRestrictions: [{ alpha2: 'DE', name: 'Germany', slug: 'germany' }] })],
    });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.remoteEligibility, 'Germany');
    assert.equal(classifyRemoteEligibility('Germany', 'de', job.remoteEligibility), 'confirmed');
  });

  test('10. an empty locationRestrictions array is worldwide -> confirmed for any destination', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ locationRestrictions: [] })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.remoteEligibility, 'Worldwide');
    assert.equal(classifyRemoteEligibility('Japan', 'jp', job.remoteEligibility), 'confirmed');
  });

  test('11. locationRestrictions naming only incompatible countries -> excluded (via the aggregator\'s filterByDestination)', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ locationRestrictions: ['France'] })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(classifyRemoteEligibility('Germany', 'de', job.remoteEligibility), 'incompatible');
  });

  test('12. missing/malformed locationRestrictions is handled honestly -> unclear, never falsely confirmed', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ locationRestrictions: undefined })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.remoteEligibility, undefined);
    assert.equal(classifyRemoteEligibility('Germany', 'de', job.remoteEligibility), 'unclear');

    mockHimalayasResponse(200, { jobs: [baseJob({ guid: 'malformed', locationRestrictions: 'not-an-array' })] });
    const malformedResult = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(malformedResult.jobs[0].remoteEligibility, undefined);
  });
});

// ---------------------------------------------------------------------------
// 13, 14. Salary + currency mapping
// ---------------------------------------------------------------------------
describe('himalayasProvider — salary mapping (13, 14)', () => {
  test('13. minSalary/maxSalary/currency/salaryPeriod all map through, and a non-annual period is never displayed as an implied annual figure', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ minSalary: 40, maxSalary: 60, currency: 'USD', salaryPeriod: 'hourly' })],
    });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.salaryMin, 40);
    assert.equal(job.salaryMax, 60);
    assert.equal(job.salaryCurrency, 'USD');
    assert.equal(job.salaryPeriod, 'hourly');
    assert.equal(formatSalary(job), 'USD 40-60/hour', 'an hourly figure must never read as an implied annual total');
  });

  test('an annual period produces the same bare-figure output every other provider already uses', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ minSalary: 70000, maxSalary: 90000, salaryPeriod: 'annual' })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(formatSalary(result.jobs[0]), 'USD 70000-90000');
  });

  test('14. missing salary remains honest — never fabricated', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ minSalary: null, maxSalary: null, currency: undefined, salaryPeriod: undefined })],
    });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    const job = result.jobs[0];
    assert.equal(job.salaryMin, undefined);
    assert.equal(job.salaryMax, undefined);
    assert.equal(formatSalary(job), 'Salary not specified by employer');
  });

  test('an unrecognized salaryPeriod string is not trusted or invented — treated as absent', async () => {
    mockHimalayasResponse(200, { jobs: [baseJob({ salaryPeriod: 'per-fortnight-ish' })] });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.jobs[0].salaryPeriod, undefined);
  });
});

// ---------------------------------------------------------------------------
// 17, 18. Relevance safety net (Step F precedent, applied to Himalayas)
// ---------------------------------------------------------------------------
describe('himalayasProvider — relevance safety net', () => {
  test('17. Marine Biologist search does not accept obviously unrelated Himalayas results', async () => {
    mockHimalayasResponse(200, {
      jobs: [
        baseJob({ guid: 'unrelated-1', title: 'Senior React Developer', excerpt: 'Build web apps.', categories: ['Software Engineering'], description: 'React, TypeScript, Node.js.' }),
        baseJob({ guid: 'unrelated-2', title: 'Growth Marketing Manager', excerpt: 'Own our funnel.', categories: ['Marketing'], description: 'Paid acquisition and SEO.' }),
      ],
    });
    const result = await himalayasProvider.search({ what: 'Marine Biologist', workModel: 'remote' });
    assert.equal(result.jobs.length, 0, `expected unrelated results to be filtered, got: ${result.jobs.map((j) => j.title).join(', ')}`);
  });

  test('18. a relevant adjacent role remains possible via description/category vocabulary, not just the title', async () => {
    mockHimalayasResponse(200, {
      jobs: [
        baseJob({ guid: 'adjacent', title: 'Environmental Data Analyst', categories: ['Environmental Science'], description: 'Analyze marine conservation and ocean ecology datasets.' }),
        baseJob({ guid: 'unrelated', title: 'Senior React Developer', categories: ['Software Engineering'], description: 'React, TypeScript.' }),
      ],
    });
    const result = await himalayasProvider.search({ what: 'Marine Biologist', workModel: 'remote' });
    assert.ok(result.jobs.some((j) => j.title === 'Environmental Data Analyst'));
    assert.ok(!result.jobs.some((j) => j.title === 'Senior React Developer'));
  });

  test('a well-matched query is essentially unaffected by the filter', async () => {
    mockHimalayasResponse(200, {
      jobs: [baseJob({ title: 'Remote Data Analyst' }), baseJob({ guid: 'job-124', title: 'Senior Data Analyst' })],
    });
    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.jobs.length, 2);
  });
});

// ---------------------------------------------------------------------------
// 20. No API key required to use the route
// ---------------------------------------------------------------------------
describe('himalayasProvider — no API key required (20)', () => {
  test('search() succeeds against the backend proxy with no credential of any kind attached', async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ jobs: [baseJob()] }), { status: 200 });
    }) as typeof fetch;

    const result = await himalayasProvider.search({ what: 'Data Analyst', workModel: 'remote' });
    assert.equal(result.ok, true);
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    assert.ok(!headers || !('Authorization' in headers), 'no API key/authorization header should ever be attached');
  });
});
