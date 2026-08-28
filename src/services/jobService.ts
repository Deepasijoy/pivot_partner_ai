import type { JobOpportunity, Skill } from '../types'
import { mockRemoteJobs, mockSkillTaxonomy } from './mockData'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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

const allSkills: Skill[] = [
  ...mockSkillTaxonomy.technical,
  ...mockSkillTaxonomy.business,
]

function detectSkills(text: string): Skill[] {
  const normalizedText = text.toLowerCase()

  return allSkills.filter((skill) => {
    return normalizedText.includes(skill.name.toLowerCase())
  })
}

function formatSalary(job: AdzunaJob): string {
  if (job.salary_min && job.salary_max) {
    return `${job.salary_min}-${job.salary_max}`
  }

  if (job.salary_min) {
    return `From ${job.salary_min}`
  }

  if (job.salary_max) {
    return `Up to ${job.salary_max}`
  }

  return 'Salary not specified by employer'
}

function mapAdzunaJob(job: AdzunaJob): JobOpportunity {
  const text = `${job.title} ${job.description || ''}`
  const requiredSkills = detectSkills(text)

  return {
    id: `adzuna_${job.id}`,
    title: job.title,
    company: job.company?.display_name || 'Company not listed',
    salaryRange: formatSalary(job),
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

    const response = await fetch(`${API_URL}/api/jobs?${params.toString()}`)

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