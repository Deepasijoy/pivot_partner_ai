// Server-side cache for Remotive's public job-listings API
// (https://remotive.com/api/remote-jobs). Required by Remotive's own API
// terms (github.com/remotive-com/remote-jobs-api / the "0-legal-notice"
// field their own API response includes): at most ~4 real requests a day
// ("more than 2 requests/minute gets blocked"), every displayed job must
// link back to its Remotive URL and credit Remotive as the source, their
// data must never be redistributed to third-party job sites, and their
// jobs must never be shown only to collect signups/emails. This module is
// the ONLY place in the codebase allowed to call Remotive's live API —
// server.js's /api/jobs/remotive route and the client's
// remotiveProvider.ts both go through the cache here, never the live URL
// directly, so a user's search can never trigger a real Remotive request.
//
// Live-behavior note (checked directly against the real API while
// building this): a no-params GET currently returns Remotive's complete
// available set — "job-count" equals "total-job-count" in the response,
// confirming nothing is being held back by pagination. That set was only
// ~19 jobs, and — more importantly — every query/category variant tried
// returned the EXACT SAME 19 job ids; response headers showed
// `cf-cache-status: HIT` with a multi-hour `Age`, meaning Remotive is
// currently serving this whole endpoint from a Cloudflare edge cache that
// ignores query strings entirely. So `search`/`category` params have no
// effect on their end right now — this cache's own local filtering
// (searchJobs below) is doing the only real relevance filtering that
// happens today. Storing the plain no-params response is therefore the
// right (and only) way to get "the full list" as it actually exists.
//
// Design:
//  - In-memory cache is checked first (cheapest, works within one running
//    process).
//  - Supabase is the durable source of truth — Render's free tier can
//    sleep/restart and wipe the in-memory cache, so a freshly started
//    process rehydrates from Supabase instead of immediately calling
//    Remotive again. Degrades gracefully to in-memory-only (with a logged
//    warning) if Supabase isn't configured or the cache table doesn't
//    exist yet — see server/data/remotive_jobs_cache.sql, which must be
//    run once by hand (this server has no service_role key or migration
//    tooling to do it automatically).
//  - A refresh (an actual live Remotive call) only happens when the
//    freshest known snapshot (in-memory, else Supabase) is older than
//    refreshIntervalMs (default 6h — exactly 4 refreshes/day, matching
//    Remotive's own "max 4 times a day" guidance).
//  - Concurrent callers during a refresh share the same in-flight promise
//    (refreshPromise below) instead of each firing their own fetch.
//  - A failed refresh logs the error and falls back to the last known-good
//    snapshot (in-memory or Supabase) — this module never throws for a
//    transient Remotive/Supabase failure; only a genuinely first-ever
//    startup with no snapshot anywhere returns an empty list.

const REMOTIVE_API_URL = 'https://remotive.com/api/remote-jobs'
const SUPABASE_TABLE = 'remotive_jobs_cache'
const SUPABASE_ROW_ID = 1

// 6h -> at most 4 real Remotive requests/day, matching their own stated
// "we advise max. 4 times a day" guidance exactly.
export const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

function isFreshSnapshot(fetchedAt, refreshIntervalMs, now) {
  if (!fetchedAt) return false
  const fetchedMs = new Date(fetchedAt).getTime()
  if (Number.isNaN(fetchedMs)) return false
  return now().getTime() - fetchedMs < refreshIntervalMs
}

// Same relevance heuristic as remotiveProvider.ts's own (now-secondary)
// client-side safety net — this is now the PRIMARY filter, since
// Remotive's own search/category params have no effect (see the live-
// behavior note above). A query with no significant words matches
// everything rather than nothing, same convention as every other provider
// adapter's isRelevant().
function isRelevant(job, what) {
  const words = what
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
  if (words.length === 0) return true
  const haystack = `${job.title ?? ''} ${job.category ?? ''} ${job.description ?? ''} ${(job.tags ?? []).join(' ')}`.toLowerCase()
  return words.some((word) => haystack.includes(word))
}

/**
 * @param {object} [options]
 * @param {string} [options.supabaseUrl]
 * @param {string} [options.supabaseKey]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests.
 * @param {number} [options.refreshIntervalMs]
 * @param {() => Date} [options.now] - injectable clock for tests.
 * @param {Pick<Console, 'log' | 'warn' | 'error'>} [options.logger]
 */
export function createRemotiveCache({
  supabaseUrl,
  supabaseKey,
  fetchImpl = fetch,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  now = () => new Date(),
  logger = console,
} = {}) {
  /** @type {{ jobs: any[]; fetchedAt: string } | null} */
  let memory = null
  /** @type {Promise<{ jobs: any[]; fetchedAt: string } | null> | null} */
  let refreshPromise = null

  async function readFromSupabase() {
    if (!supabaseUrl || !supabaseKey) return null
    try {
      const response = await fetchImpl(
        `${supabaseUrl}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_ROW_ID}&select=jobs,fetched_at`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      )
      if (!response.ok) {
        logger.warn(`[remotiveCache] Supabase read returned HTTP ${response.status} — has server/data/remotive_jobs_cache.sql been run?`)
        return null
      }
      const rows = await response.json()
      const row = Array.isArray(rows) ? rows[0] : undefined
      if (!row) return null
      return { jobs: row.jobs, fetchedAt: row.fetched_at }
    } catch (error) {
      logger.warn('[remotiveCache] Supabase read failed:', error.message)
      return null
    }
  }

  async function writeToSupabase(jobs, fetchedAt) {
    if (!supabaseUrl || !supabaseKey) return
    try {
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify([{ id: SUPABASE_ROW_ID, jobs, fetched_at: fetchedAt }]),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        logger.warn(`[remotiveCache] Supabase write failed: HTTP ${response.status} ${text}`)
      }
    } catch (error) {
      logger.warn('[remotiveCache] Supabase write failed:', error.message)
    }
  }

  async function fetchLiveFromRemotive() {
    const timestamp = now().toISOString()
    logger.log(`[remotiveCache] Fetching live Remotive snapshot at ${timestamp}`)
    const response = await fetchImpl(REMOTIVE_API_URL)
    if (!response.ok) {
      throw new Error(`Remotive API returned HTTP ${response.status}`)
    }
    const data = await response.json()
    if (!Array.isArray(data.jobs)) {
      throw new Error('Remotive returned a malformed response (jobs is not an array)')
    }
    return data.jobs
  }

  async function doRefresh() {
    try {
      const jobs = await fetchLiveFromRemotive()
      const fetchedAt = now().toISOString()
      memory = { jobs, fetchedAt }
      await writeToSupabase(jobs, fetchedAt)
      return memory
    } catch (error) {
      logger.warn('[remotiveCache] Refresh failed, keeping last known-good snapshot:', error.message)
      // Still whatever memory already held (possibly null, on a first-ever
      // startup with no prior snapshot anywhere) — never thrown further.
      return memory
    }
  }

  async function ensureFresh() {
    if (isFreshSnapshot(memory?.fetchedAt, refreshIntervalMs, now)) return memory

    // Cold start (no in-memory snapshot yet) — check Supabase before
    // deciding a live call is needed. Once memory holds *anything*
    // (even stale), re-checking Supabase can't help: this is a single
    // process, so nothing else could have refreshed it since.
    if (!memory) {
      const fromSupabase = await readFromSupabase()
      if (fromSupabase) {
        memory = fromSupabase
        if (isFreshSnapshot(memory.fetchedAt, refreshIntervalMs, now)) return memory
      }
    }

    // Concurrency guard: every caller that arrives while a refresh is
    // already in flight awaits that SAME promise rather than starting its
    // own — this is what makes "N simultaneous user searches while the
    // cache is stale" cost exactly one real Remotive request, not N.
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  }

  async function getSnapshot() {
    const snapshot = await ensureFresh()
    return snapshot?.jobs ?? []
  }

  async function searchJobs(what, limit = 30) {
    const jobs = await getSnapshot()
    const trimmed = (what ?? '').trim()
    const matched = trimmed ? jobs.filter((job) => isRelevant(job, trimmed)) : jobs
    return matched.slice(0, limit)
  }

  return { getSnapshot, searchJobs, ensureFresh }
}
