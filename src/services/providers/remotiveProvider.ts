// Remotive provider adapter. Public, no API key (Access-Control-Allow-
// Origin: *), so this calls the API directly from the browser.
//
// Its `search` param genuinely filters server-side for common/tech-adjacent
// queries — but is confirmed, via direct API testing, to return broad,
// largely irrelevant results for niche/non-tech occupations: a live
// `search=Marine+Biologist` call returned 19 jobs (Senior React Developer,
// DevOps Engineer, Head of Marketing & Communications, ...), none with any
// marine-science connection at all. isRelevant() below is a loose,
// additive safety net for exactly that gap — see its own comment.
//
// Remotive is a remote-only job board — there is no local/hybrid listing
// to return, so this provider only participates in 'remote' searches
// (supports() below).

import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './types';

const API_URL = 'https://remotive.com/api/remote-jobs';

const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000;

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  // Free text, e.g. "USA", "Europe", "Worldwide" — the strongest remote-
  // eligibility signal any of these providers gives.
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

function mapRemotiveJob(job: RemotiveJob): NormalizedJob {
  return {
    id: `remotive_${job.id}`,
    source: 'remotive',
    sourceJobId: String(job.id),
    title: job.title,
    company: job.company_name || 'Company not listed',
    description: job.description ? job.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
    location: job.candidate_required_location || 'Remote',
    workModel: 'remote',
    employmentType: job.job_type,
    applicationUrl: job.url,
    postedAt: job.publication_date,
    salaryRaw: job.salary || undefined,
    remoteEligibility: job.candidate_required_location,
  };
}

// Loose, additive relevance safety net — Remotive's own `search` filtering
// already works well for common/tech-adjacent queries, so this removes a
// result only when NONE of the query's significant words appear anywhere
// in its title, category, or description; a query that already gets
// well-filtered results is essentially unaffected (every genuinely
// relevant job naturally mentions the query terms somewhere). Deliberately
// not an occupation classifier and not stricter than that — a legitimate
// adjacent title ("Environmental Data Analyst" for a marine-biology
// search) still passes as long as its description mentions related
// vocabulary; real occupation-aware scoring happens downstream in
// occupationMatchingService.ts. Same shape as arbeitnowProvider.ts's
// isRelevant(), kept provider-local per Step F.
function isRelevant(job: RemotiveJob, what: string): boolean {
  const words = what
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return true;
  const haystack = `${job.title} ${job.category ?? ''} ${job.description ?? ''}`.toLowerCase();
  return words.some((word) => haystack.includes(word));
}

async function search(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  try {
    const query = new URLSearchParams({ search: params.what, limit: '30' });
    const response = await fetchWithRetry(`${API_URL}?${query.toString()}`, {
      timeoutMs: params.timeoutMs ?? FETCH_TIMEOUT_MS,
      signal: params.signal,
    });
    if (!response.ok) {
      return { source: 'remotive', jobs: [], ok: false, error: `Remotive API returned ${response.status}` };
    }

    const data: RemotiveResponse = await response.json();

    // A schema this adapter doesn't recognize (e.g. `jobs` present but not
    // an array — a provider-side API change) is a controlled failure, not
    // a crash for the whole aggregated search.
    if (!Array.isArray(data.jobs)) {
      return { source: 'remotive', jobs: [], ok: false, error: 'Remotive returned a malformed response.' };
    }

    // Eligibility classification (confirmed / unclear / excluded-as-
    // incompatible) is applied uniformly across every provider by
    // jobAggregatorService.ts's filterByDestination — see
    // geoMatch.ts's classifyRemoteEligibility — so this adapter no longer
    // pre-filters on it itself; doing so here as well previously excluded
    // jobs with no eligibility text at all, which the aggregator now
    // deliberately keeps (marked 'unclear') rather than hard-excludes.
    // A listing with no real title is rejected outright. isRelevant() is
    // the Step F client-side relevance safety net — see its own comment.
    const jobs = data.jobs
      .filter((job) => Boolean(job.title?.trim()))
      .filter((job) => isRelevant(job, params.what))
      .map(mapRemotiveJob);

    return { source: 'remotive', jobs, ok: true };
  } catch (error) {
    if (error instanceof FetchAbortError) {
      return { source: 'remotive', jobs: [], ok: false, error: error.message };
    }
    return {
      source: 'remotive',
      jobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Remotive search failed.',
    };
  }
}

export const remotiveProvider: JobProvider = {
  id: 'remotive',
  supports(params) {
    return params.workModel === 'remote';
  },
  search,
};
