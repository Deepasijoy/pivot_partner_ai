import type { JobOpportunity } from '../types'
import { mockRemoteJobs } from './mockData'
import { detectSkills } from './skillExtractionService'
import { fetchWithRetry } from '../utils/fetchWithRetry'
import { formatSalary } from './salaryFormatting'

// Optional-chained so this module can also be imported under plain Node
// (tests) without throwing at module-load time — see providers/adzunaProvider.ts.
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000'
const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000

interface AdzunaJob {
  id: string | number
  title: string
  description?: string
  company?: {
    display_name?: string
  }
  location?: {
    display_name?: string
  }
  salary_min?: number
  salary_max?: number
  redirect_url?: string
}

interface AdzunaResponse {
  results: AdzunaJob[]
  count: number
}

// Re-exported so existing call sites (mapAdzunaJob below, and
// jobAggregatorService.ts's Job -> JobOpportunity mapping boundary for jobs
// sourced from the other providers) keep working unchanged, while the
// actual detection logic — including the alias table and fuzzy matching
// resume parsing already had — now lives in one shared place
// (skillExtractionService.ts) instead of two drifting implementations.
export { detectSkills }

function mapAdzunaJob(job: AdzunaJob): JobOpportunity {
  const text = `${job.title} ${job.description || ''}`
  const requiredSkills = detectSkills(text)

  return {
    id: `adzuna_${job.id}`,
    title: job.title,
    company: job.company?.display_name || 'Company not listed',
    salaryRange: formatSalary({ salaryMin: job.salary_min, salaryMax: job.salary_max }),
    timezone: job.location?.display_name || 'Location not specified',
    matchScore: 0,
    requiredSkills,
    matchedSkills: [],
    missingSkills: requiredSkills,
    description: job.description || '',
    employmentMatch: 0,
    applyUrl: job.redirect_url,
  }
}

export interface JobFetchParams {
  what: string
  where?: string
  country?: string
}

// 'live' — real Adzuna results. 'empty' — the search completed but found
// zero usable listings (a valid, honest outcome, not a failure). 'error' —
// the search could not be completed at all (network/API failure, or
// couldn't even be attempted — no destination, unsupported country). UI
// code must not conflate 'empty' and 'error': they mean different things to
// the user ("nothing live right now" vs. "we couldn't check right now").
export type JobFetchSource = 'live' | 'empty' | 'error'

export interface JobFetchResult {
  jobs: JobOpportunity[]
  source: JobFetchSource
  reason?: string
}

// A confirmed zero-result outcome. Never carries mock jobs — an empty
// `jobs` array here is the honest signal "we searched live and found
// nothing," not "here are some jobs to show instead." Callers that want a
// mock substrate for *career guidance* (skill gaps, courses, career paths —
// never presented as real listings) use jobsForCareerGuidance() below, on
// purpose, at the point they need it — never baked into the fetch result
// itself, so "zero live results" and "here's example data" can never be
// confused with each other in the data.
export function emptyResult(reason: string): JobFetchResult {
  return { jobs: [], source: 'empty', reason }
}

// The search itself could not be completed — network/API failure, or a
// precondition that made the attempt itself impossible (no destination
// resolved, or the destination's country isn't supported by the job-search
// provider). Distinct from emptyResult: this means live availability is
// simply unknown, not that we confirmed there's nothing live.
export function errorResult(reason: string): JobFetchResult {
  console.warn(`Live job search unavailable: ${reason}`)
  return { jobs: [], source: 'error', reason }
}

// Career/skill guidance (Skill Gaps, Recommended Courses, Career Paths, the
// Remote section's own example cards) must keep working even with zero live
// listings — it has always used mockRemoteJobs as a scoring substrate when
// no real jobs are available. This centralizes that "use mock data only for
// guidance, never as a live listing" policy in one place, since `jobs` can
// now legitimately be a real empty array (not just `undefined`) coming back
// from emptyResult/errorResult above — plain default-parameter fallbacks
// (`= mockRemoteJobs`) don't trigger on an empty array, only on `undefined`.
export function jobsForCareerGuidance(jobs: JobOpportunity[] | undefined | null): JobOpportunity[] {
  return jobs && jobs.length > 0 ? jobs : mockRemoteJobs
}

/**
 * Loads job opportunities for a caller-supplied search query and resolved
 * destination country. Nothing here is hard-coded to a job title or a
 * location — `what` and `country` must both be supplied by the caller
 * (derived from the profile via jobQueryService.ts and from the resolved
 * destination via locationService.ts). Returns a tagged result so callers
 * can tell live Adzuna data from the mock fallback apart and label the UI
 * accordingly — live and mock jobs are never mixed in one result.
 */
export async function loadJobOpportunities({
  what,
  where = '',
  country,
}: JobFetchParams): Promise<JobFetchResult> {
  if (!what || !what.trim()) {
    return errorResult('No job-search query was provided.')
  }

  if (!country || !country.trim()) {
    return errorResult('No resolved destination country was provided for the search.')
  }

  try {
    const params = new URLSearchParams({ what, country })

    if (where) {
      params.set('where', where)
    }

    const response = await fetchWithRetry(`${API_URL}/api/jobs?${params.toString()}`, {
      timeoutMs: FETCH_TIMEOUT_MS,
    })

    if (!response.ok) {
      return errorResult(`Job API returned ${response.status}`)
    }

    const data: AdzunaResponse = await response.json()

    if (!data.results || data.results.length === 0) {
      return emptyResult('Adzuna returned no usable jobs for this search.')
    }

    return { jobs: data.results.map(mapAdzunaJob), source: 'live' }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : 'Live Adzuna job search failed.')
  }
}

/**
 * @deprecated Temporary compatibility shim for SkillAnalysis.tsx's current
 * direct call site, which still expects a bare JobOpportunity[]. Pipeline
 * Step 8 will update SkillAnalysis.tsx to receive jobs via props from
 * JobMatcherTab (which will call loadJobOpportunities() directly with a
 * real profile-derived query and resolved country) and this shim can then
 * be removed. 'jobs' is a neutral placeholder, not a specific role — with
 * no country available at this call site, this always resolves to the
 * fallback path (correctly, per the tagged contract above) until the real
 * caller is updated.
 */
export async function fetchLiveJobs(what = 'jobs', where = ''): Promise<JobOpportunity[]> {
  const result = await loadJobOpportunities({ what, where })
  return result.jobs
}