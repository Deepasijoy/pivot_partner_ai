import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRemotiveCache, DEFAULT_REFRESH_INTERVAL_MS } from '../services/remotiveCache.js'

const SAMPLE_JOBS = [
  {
    id: 1,
    title: 'Senior Data Analyst',
    company_name: 'Acme',
    category: 'Data',
    tags: ['sql', 'analytics'],
    description: 'Work with dashboards.',
    url: 'https://remotive.com/remote-jobs/data/senior-data-analyst-1',
    candidate_required_location: 'Worldwide',
    job_type: 'full_time',
    publication_date: '2026-09-01T00:00:00Z',
  },
  {
    id: 2,
    title: 'Senior Backend Engineer',
    company_name: 'Beta Corp',
    category: 'Software Development',
    tags: ['node', 'postgres'],
    description: 'Build APIs.',
    url: 'https://remotive.com/remote-jobs/software-dev/senior-backend-engineer-2',
    candidate_required_location: 'USA',
    job_type: 'full_time',
    publication_date: '2026-09-02T00:00:00Z',
  },
]

function fakeLogger() {
  const calls = { log: [], warn: [], error: [] }
  return {
    calls,
    log: (...args) => calls.log.push(args.join(' ')),
    warn: (...args) => calls.warn.push(args.join(' ')),
    error: (...args) => calls.error.push(args.join(' ')),
  }
}

// Routes a mock fetch by URL: the real Remotive endpoint vs a fake
// Supabase REST endpoint — close enough to createRemotiveCache's real
// call shapes to exercise both paths without any real network/DB access.
function makeFetchRouter({ remotiveHandler, supabaseRows = [] } = {}) {
  const calls = { remotive: 0, supabaseReads: 0, supabaseWrites: 0 }
  const state = { rows: supabaseRows }

  const fetchImpl = async (url, init) => {
    const urlStr = String(url)
    if (urlStr.startsWith('https://remotive.com')) {
      calls.remotive++
      if (remotiveHandler) return remotiveHandler(calls.remotive)
      return { ok: true, json: async () => ({ jobs: SAMPLE_JOBS, 'job-count': SAMPLE_JOBS.length, 'total-job-count': SAMPLE_JOBS.length }) }
    }
    if (urlStr.includes('/rest/v1/remotive_jobs_cache')) {
      if (init?.method === 'POST') {
        calls.supabaseWrites++
        const [row] = JSON.parse(init.body)
        state.rows = [row]
        return { ok: true, json: async () => state.rows }
      }
      calls.supabaseReads++
      return { ok: true, json: async () => state.rows }
    }
    throw new Error(`Unexpected fetch URL in test: ${urlStr}`)
  }

  return { fetchImpl, calls, state }
}

describe('remotiveCache — freshness (no refetch under 6h)', () => {
  test('a second call within the refresh interval does not hit the live API again', async () => {
    const { fetchImpl, calls } = makeFetchRouter()
    let currentTime = new Date('2026-09-23T00:00:00Z')
    const cache = createRemotiveCache({ fetchImpl, now: () => currentTime, logger: fakeLogger() })

    await cache.getSnapshot()
    assert.equal(calls.remotive, 1)

    currentTime = new Date('2026-09-23T05:59:00Z') // < 6h later
    const jobs = await cache.getSnapshot()
    assert.equal(calls.remotive, 1, 'should still be exactly one real Remotive call')
    assert.equal(jobs.length, SAMPLE_JOBS.length)
  })

  test('a call after the refresh interval elapses does trigger a new live fetch', async () => {
    const { fetchImpl, calls } = makeFetchRouter()
    let currentTime = new Date('2026-09-23T00:00:00Z')
    const cache = createRemotiveCache({ fetchImpl, now: () => currentTime, logger: fakeLogger() })

    await cache.getSnapshot()
    assert.equal(calls.remotive, 1)

    currentTime = new Date(currentTime.getTime() + DEFAULT_REFRESH_INTERVAL_MS + 1000)
    await cache.getSnapshot()
    assert.equal(calls.remotive, 2)
  })
})

describe('remotiveCache — concurrent-refresh guard', () => {
  test('N simultaneous callers on a cold cache trigger exactly one live Remotive call', async () => {
    const { fetchImpl, calls } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })

    const results = await Promise.all([
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
    ])

    assert.equal(calls.remotive, 1, 'five concurrent callers must share one in-flight refresh')
    for (const jobs of results) {
      assert.equal(jobs.length, SAMPLE_JOBS.length)
    }
  })
})

describe('remotiveCache — refresh failure keeps the last known-good snapshot', () => {
  test('a failed refresh does not clear or throw past an existing snapshot', async () => {
    let shouldFail = false
    const { fetchImpl, calls } = makeFetchRouter({
      remotiveHandler: async () => {
        if (shouldFail) throw new Error('network down')
        return { ok: true, json: async () => ({ jobs: SAMPLE_JOBS }) }
      },
    })
    let currentTime = new Date('2026-09-23T00:00:00Z')
    const logger = fakeLogger()
    const cache = createRemotiveCache({ fetchImpl, now: () => currentTime, logger })

    const first = await cache.getSnapshot()
    assert.equal(first.length, SAMPLE_JOBS.length)

    shouldFail = true
    currentTime = new Date(currentTime.getTime() + DEFAULT_REFRESH_INTERVAL_MS + 1000)
    const second = await cache.getSnapshot()

    assert.deepEqual(second, first, 'stale-but-good snapshot must still be served after a failed refresh')
    assert.ok(logger.calls.warn.some((line) => line.includes('Refresh failed')))
  })

  test('a first-ever startup with no snapshot anywhere and a failing fetch returns an empty list, never throws', async () => {
    const { fetchImpl } = makeFetchRouter({
      remotiveHandler: async () => {
        throw new Error('network down')
      },
    })
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const jobs = await cache.getSnapshot()
    assert.deepEqual(jobs, [])
  })
})

describe('remotiveCache — Supabase persistence', () => {
  test('a successful refresh writes the snapshot to Supabase', async () => {
    const { fetchImpl, calls } = makeFetchRouter()
    const cache = createRemotiveCache({
      fetchImpl,
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'test-key',
      logger: fakeLogger(),
    })
    await cache.getSnapshot()
    assert.equal(calls.supabaseWrites, 1)
  })

  test('a cold start with no in-memory snapshot rehydrates from a fresh Supabase row instead of calling Remotive', async () => {
    const fetchedAt = new Date().toISOString() // fresh
    const { fetchImpl, calls } = makeFetchRouter({
      supabaseRows: [{ id: 1, jobs: SAMPLE_JOBS, fetched_at: fetchedAt }],
    })
    const cache = createRemotiveCache({
      fetchImpl,
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'test-key',
      logger: fakeLogger(),
    })
    const jobs = await cache.getSnapshot()
    assert.equal(calls.remotive, 0, 'a fresh Supabase snapshot must be used instead of a live call')
    assert.equal(calls.supabaseReads, 1)
    assert.equal(jobs.length, SAMPLE_JOBS.length)
  })

  test('a cold start with a STALE Supabase row still refreshes live', async () => {
    const staleFetchedAt = new Date(Date.now() - DEFAULT_REFRESH_INTERVAL_MS - 1000).toISOString()
    const { fetchImpl, calls } = makeFetchRouter({
      supabaseRows: [{ id: 1, jobs: SAMPLE_JOBS, fetched_at: staleFetchedAt }],
    })
    const cache = createRemotiveCache({
      fetchImpl,
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'test-key',
      logger: fakeLogger(),
    })
    await cache.getSnapshot()
    assert.equal(calls.remotive, 1)
  })

  test('with no Supabase credentials configured, the cache still works in-memory only', async () => {
    const { fetchImpl, calls } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const jobs = await cache.getSnapshot()
    assert.equal(jobs.length, SAMPLE_JOBS.length)
    assert.equal(calls.supabaseReads, 0)
    assert.equal(calls.supabaseWrites, 0)
  })

  test('a Supabase write failure is logged but never breaks the response', async () => {
    const { fetchImpl } = makeFetchRouter()
    const failingFetch = async (url, init) => {
      if (String(url).includes('/rest/v1/') && init?.method === 'POST') {
        return { ok: false, status: 404, text: async () => 'relation "remotive_jobs_cache" does not exist' }
      }
      return fetchImpl(url, init)
    }
    const logger = fakeLogger()
    const cache = createRemotiveCache({
      fetchImpl: failingFetch,
      supabaseUrl: 'https://example.supabase.co',
      supabaseKey: 'test-key',
      logger,
    })
    const jobs = await cache.getSnapshot()
    assert.equal(jobs.length, SAMPLE_JOBS.length, 'Remotive data is still served even if Supabase write fails')
    assert.ok(logger.calls.warn.some((line) => line.includes('Supabase write failed')))
  })
})

describe('remotiveCache — logging every real Remotive call', () => {
  test('each live fetch logs a timestamped line', async () => {
    const { fetchImpl } = makeFetchRouter()
    let currentTime = new Date('2026-09-23T00:00:00Z')
    const logger = fakeLogger()
    const cache = createRemotiveCache({ fetchImpl, now: () => currentTime, logger })

    await cache.getSnapshot()
    currentTime = new Date(currentTime.getTime() + DEFAULT_REFRESH_INTERVAL_MS + 1000)
    await cache.getSnapshot()

    const fetchLogLines = logger.calls.log.filter((line) => line.includes('Fetching live Remotive snapshot'))
    assert.equal(fetchLogLines.length, 2)
    assert.ok(fetchLogLines[0].includes('2026-09-23T00:00:00'))
  })
})

describe('remotiveCache — local search (title/tags/category/description)', () => {
  test('matches on title', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('Data Analyst')
    assert.equal(results.length, 1)
    assert.equal(results[0].title, 'Senior Data Analyst')
  })

  test('matches on category', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('Software Development')
    assert.equal(results.length, 1)
    assert.equal(results[0].title, 'Senior Backend Engineer')
  })

  test('matches on tags', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('postgres')
    assert.equal(results.length, 1)
    assert.equal(results[0].title, 'Senior Backend Engineer')
  })

  test('an empty/blank query returns the whole snapshot (capped by limit)', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('   ')
    assert.equal(results.length, SAMPLE_JOBS.length)
  })

  test('respects the limit parameter', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('', 1)
    assert.equal(results.length, 1)
  })

  test('a query matching nothing returns an empty array, not the full set', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const results = await cache.searchJobs('nursing surgeon hospital')
    assert.deepEqual(results, [])
  })
})

describe('remotiveCache — normalization / attribution fields preserved', () => {
  test('returned jobs still carry the raw fields remotiveProvider.ts and the UI badge need', async () => {
    const { fetchImpl } = makeFetchRouter()
    const cache = createRemotiveCache({ fetchImpl, logger: fakeLogger() })
    const [job] = await cache.searchJobs('Data Analyst')
    assert.equal(job.url, 'https://remotive.com/remote-jobs/data/senior-data-analyst-1')
    assert.equal(job.candidate_required_location, 'Worldwide')
    assert.equal(job.company_name, 'Acme')
    assert.equal(job.id, 1)
  })

  test('a malformed live response (jobs not an array) is treated as a failed refresh, not a crash', async () => {
    const { fetchImpl } = makeFetchRouter({
      remotiveHandler: async () => ({ ok: true, json: async () => ({ jobs: 'not-an-array' }) }),
    })
    const logger = fakeLogger()
    const cache = createRemotiveCache({ fetchImpl, logger })
    const jobs = await cache.getSnapshot()
    assert.deepEqual(jobs, [])
    assert.ok(logger.calls.warn.some((line) => line.includes('Refresh failed')))
  })
})
