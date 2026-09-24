import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { remotiveProvider } from '../providers/remotiveProvider';

// Real case that motivated this: four differently-titled Remotive
// postings (AI Engineer, .NET Developer, Data Scientist, React Developer)
// all had their description's external link pointing to
// lemon.io/for-developers — a generic talent-marketplace signup page, not
// a page about any specific role — with only a utm_campaign query
// parameter differing between them. Remotive's API gives no dedicated
// "apply URL" field; the real destination is embedded inline in the
// description HTML as an ordinary <a href>. These tests use that same
// shape (a shared origin+path, differing only by tracking query string)
// to prove the detection actually catches it, not just an exact full-URL
// match — an exact match would have missed the real case entirely.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function descriptionWithLink(link: string, jobText: string): string {
  return `<p>${jobText} Apply via <a href="${link}" rel="nofollow">this link</a>.</p>`;
}

function mockRemotiveResponse(jobs: unknown[]) {
  globalThis.fetch = (async () => new Response(JSON.stringify({ jobs }), { status: 200 })) as typeof fetch;
}

describe('remotiveProvider — generic apply-link detection', () => {
  test('3 postings sharing one apply link (with differing tracking params) are flagged; 2 with unique links are not', async () => {
    mockRemotiveResponse([
      {
        id: 1,
        url: 'https://remotive.com/remote-jobs/x/ai-engineer-1',
        title: 'Senior AI Engineer',
        company_name: 'Lemon.io',
        description: descriptionWithLink('https://lemon.io/for-developers/?utm_campaign=ai_engineer', 'AI Engineer role.'),
      },
      {
        id: 2,
        url: 'https://remotive.com/remote-jobs/x/net-developer-2',
        title: 'Senior .NET Developer',
        company_name: 'Lemon.io',
        description: descriptionWithLink('https://lemon.io/for-developers/?utm_campaign=net_developer', '.NET Developer role.'),
      },
      {
        id: 3,
        url: 'https://remotive.com/remote-jobs/x/data-scientist-3',
        title: 'Senior Data Scientist',
        company_name: 'Lemon.io',
        description: descriptionWithLink('https://lemon.io/for-developers/?utm_campaign=data_scientist', 'Data Scientist role.'),
      },
      {
        id: 4,
        url: 'https://remotive.com/remote-jobs/x/backend-engineer-4',
        title: 'Backend Engineer',
        company_name: 'Acme Corp',
        description: descriptionWithLink('https://acme-corp-jobs.example.com/apply/456', 'Backend Engineer role at Acme.'),
      },
      {
        id: 5,
        url: 'https://remotive.com/remote-jobs/x/designer-5',
        title: 'Product Designer',
        company_name: 'Beta Studio',
        description: descriptionWithLink('https://beta-studio-careers.example.com/apply/789', 'Product Designer role at Beta.'),
      },
    ]);

    const result = await remotiveProvider.search({ what: '', workModel: 'remote' });
    assert.equal(result.ok, true);

    const byTitle = Object.fromEntries(result.jobs.map((j) => [j.title, j]));

    assert.equal(byTitle['Senior AI Engineer'].applyLinkIsGeneric, true);
    assert.equal(byTitle['Senior .NET Developer'].applyLinkIsGeneric, true);
    assert.equal(byTitle['Senior Data Scientist'].applyLinkIsGeneric, true);

    assert.equal(byTitle['Backend Engineer'].applyLinkIsGeneric, undefined);
    assert.equal(byTitle['Product Designer'].applyLinkIsGeneric, undefined);
  });

  test('a link shared by only 2 postings (not 3+) is not flagged', async () => {
    mockRemotiveResponse([
      {
        id: 10,
        url: 'https://remotive.com/remote-jobs/x/role-a',
        title: 'Role A',
        company_name: 'Pair Co',
        description: descriptionWithLink('https://pairco.example.com/careers?utm=a', 'Role A.'),
      },
      {
        id: 11,
        url: 'https://remotive.com/remote-jobs/x/role-b',
        title: 'Role B',
        company_name: 'Pair Co',
        description: descriptionWithLink('https://pairco.example.com/careers?utm=b', 'Role B.'),
      },
    ]);

    const result = await remotiveProvider.search({ what: '', workModel: 'remote' });
    for (const job of result.jobs) {
      assert.equal(job.applyLinkIsGeneric, undefined, `expected ${job.title} not to be flagged when only 2 share a link`);
    }
  });

  test('a job whose description links only to Remotive itself is never flagged', async () => {
    mockRemotiveResponse([
      {
        id: 20,
        url: 'https://remotive.com/remote-jobs/x/role-c',
        title: 'Role C',
        company_name: 'Direct Co',
        description: '<p>Apply directly on <a href="https://remotive.com/remote-jobs/x/role-c">Remotive</a>.</p>',
      },
      {
        id: 21,
        url: 'https://remotive.com/remote-jobs/x/role-d',
        title: 'Role D',
        company_name: 'Direct Co',
        description: '<p>Apply directly on <a href="https://remotive.com/remote-jobs/x/role-d">Remotive</a>.</p>',
      },
      {
        id: 22,
        url: 'https://remotive.com/remote-jobs/x/role-e',
        title: 'Role E',
        company_name: 'Direct Co',
        description: '<p>Apply directly on <a href="https://remotive.com/remote-jobs/x/role-e">Remotive</a>.</p>',
      },
    ]);

    const result = await remotiveProvider.search({ what: '', workModel: 'remote' });
    for (const job of result.jobs) {
      assert.equal(job.applyLinkIsGeneric, undefined);
    }
  });

  test('a job with no link at all in its description is never flagged', async () => {
    mockRemotiveResponse([
      { id: 30, url: 'https://remotive.com/remote-jobs/x/role-f', title: 'Role F', company_name: 'No Link Co', description: '<p>No links here.</p>' },
    ]);

    const result = await remotiveProvider.search({ what: '', workModel: 'remote' });
    assert.equal(result.jobs[0].applyLinkIsGeneric, undefined);
  });
});
