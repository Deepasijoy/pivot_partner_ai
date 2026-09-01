import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { remotiveProvider } from '../providers/remotiveProvider';

// Step F regression: confirmed live via a direct call to Remotive's public
// API (search=Marine+Biologist) that its own server-side filtering returns
// broad, unrelated results for niche/non-tech queries — 19 jobs including
// "Senior React Full-stack Developer" and "Head of Marketing &
// Communications", none connected to marine biology at all. This is the
// exact fixture shape that call returned (trimmed to the fields the
// provider maps).

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockRemotiveResponse(jobs: unknown[]) {
  globalThis.fetch = (async () => new Response(JSON.stringify({ jobs }), { status: 200 })) as typeof fetch;
}

const CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS = [
  { id: 1, url: 'https://x/1', title: 'Senior React Full-stack Developer', company_name: 'Lemon.io', description: 'Build modern web apps with React and Node.js.' },
  { id: 2, url: 'https://x/2', title: 'Senior QA Engineer', company_name: 'Lemon.io', description: 'Own test automation for our SaaS platform.' },
  { id: 3, url: 'https://x/3', title: 'Senior DevOps Engineer', company_name: 'Lemon.io', description: 'Manage CI/CD pipelines and cloud infrastructure.' },
  { id: 4, url: 'https://x/4', title: 'Head of Marketing & Communications', company_name: 'garden3d', description: 'Lead our brand and growth marketing efforts.' },
  { id: 5, url: 'https://x/5', title: 'Senior Independent AI Engineer / Architect', company_name: 'A.Team', description: 'Design and ship AI-powered products for clients.' },
];

describe('remotiveProvider — client-side relevance filter (Step F)', () => {
  test('a niche query ("Marine Biologist") no longer returns unrelated tech/marketing jobs, even when Remotive itself returns them', async () => {
    mockRemotiveResponse(CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS);

    const result = await remotiveProvider.search({ what: 'Marine Biologist', workModel: 'remote' });
    assert.equal(result.ok, true);
    assert.equal(result.jobs.length, 0, `expected every confirmed-irrelevant result to be filtered out, got: ${result.jobs.map((j) => j.title).join(', ')}`);
  });

  test('a genuinely relevant title/description match is kept', async () => {
    mockRemotiveResponse([
      ...CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS,
      { id: 6, url: 'https://x/6', title: 'Marine Biologist - Coastal Research', company_name: 'OceanWorks', description: 'Study coastal marine ecosystems.' },
    ]);

    const result = await remotiveProvider.search({ what: 'Marine Biologist', workModel: 'remote' });
    const titles = result.jobs.map((j) => j.title);
    assert.deepEqual(titles, ['Marine Biologist - Coastal Research']);
  });

  test('a legitimate adjacent title survives via description vocabulary, even without the exact query words in the title', async () => {
    mockRemotiveResponse([
      ...CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS,
      {
        id: 7,
        url: 'https://x/7',
        title: 'Environmental Data Analyst',
        company_name: 'EcoMetrics',
        description: 'Analyze environmental and marine conservation datasets to support climate research.',
      },
    ]);

    const result = await remotiveProvider.search({ what: 'Marine Biologist', workModel: 'remote' });
    assert.ok(
      result.jobs.some((j) => j.title === 'Environmental Data Analyst'),
      'an adjacent role whose description genuinely relates to the query must not be filtered out just because the title alone does not match'
    );
  });

  test('a common tech query, where Remotive\'s own filtering already works well, is essentially unaffected', async () => {
    mockRemotiveResponse([
      { id: 8, url: 'https://x/8', title: 'Senior React Developer', company_name: 'Acme', description: 'Build React apps.' },
      { id: 9, url: 'https://x/9', title: 'React Native Engineer', company_name: 'Acme', description: 'Build mobile apps with React Native.' },
    ]);

    const result = await remotiveProvider.search({ what: 'React Developer', workModel: 'remote' });
    assert.equal(result.jobs.length, 2, 'a query that already gets well-filtered, genuinely relevant results must not be over-suppressed');
  });

  test('a query with no significant words matches everything (never filters to nothing on an empty/near-empty query)', async () => {
    mockRemotiveResponse(CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS);
    const result = await remotiveProvider.search({ what: 'a', workModel: 'remote' });
    assert.equal(result.jobs.length, CONFIRMED_IRRELEVANT_REMOTIVE_RESULTS.length);
  });
});
