import type { JobOpportunity, Skill } from '../types'
import { mockRemoteJobs, mockSkillTaxonomy } from './mockData'

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

  return 'Salary not listed'
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
  }
}

export interface JobFetchParams {
  what: string
  where?: string
  country?: string
}

export interface JobFetchResult {
  jobs: JobOpportunity[]
  source: 'live' | 'fallback'
  reason?: string
}

function fallbackResult(reason: string): JobFetchResult {
  console.warn(`Job search using mock fallback jobs: ${reason}`)
  return { jobs: mockRemoteJobs, source: 'fallback', reason }
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
    return fallbackResult('No job-search query was provided.')
  }

  if (!country || !country.trim()) {
    return fallbackResult('No resolved destination country was provided for the search.')
  }

  try {
    const params = new URLSearchParams({ what, country })

    if (where) {
      params.set('where', where)
    }

    const response = await fetch(`/api/jobs?${params.toString()}`)

    if (!response.ok) {
      return fallbackResult(`Job API returned ${response.status}`)
    }

    const data: AdzunaResponse = await response.json()

    if (!data.results || data.results.length === 0) {
      return fallbackResult('Adzuna returned no usable jobs for this search.')
    }

    return { jobs: data.results.map(mapAdzunaJob), source: 'live' }
  } catch (error) {
    return fallbackResult(error instanceof Error ? error.message : 'Live Adzuna job search failed.')
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