// JSearch (RapidAPI) provider adapter. JSearch requires a paid/freemium
// RapidAPI key, which must never be shipped to the browser — so unlike
// Arbeitnow/Remotive, this calls a small backend proxy route
// (GET /api/jobs/jsearch in server/server.js) instead of the provider's
// API directly. When no JSEARCH_API_KEY is configured server-side, that
// route responds 501 and this adapter reports itself as "not configured"
// — a normal, expected ProviderSearchResult (ok:false with a clear
// reason), never a crash and never presented as "zero jobs found."

import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './types';

// Optional-chained — see adzunaProvider.ts for why (importable under plain
// Node, where there is no import.meta.env at all).
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000';
const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000;

// 501 from our own /api/jobs/jsearch proxy means "JSEARCH_API_KEY isn't
// configured" (see server/server.js) — retrying can never fix that, unlike
// a genuine transient 5xx from the real JSearch API, so it's excluded from
// the default "retry any 5xx" behavior.
function isRetryableJsearchStatus(status: number): boolean {
  return status >= 500 && status !== 501;
}

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name?: string;
  job_description?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_employment_type?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_is_remote?: boolean;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
}

interface JSearchResponse {
  status?: string;
  data?: JSearchJob[];
}

function mapJSearchJob(job: JSearchJob, workModel: ProviderSearchParams['workModel']): NormalizedJob {
  const locationParts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
  return {
    id: `jsearch_${job.job_id}`,
    source: 'jsearch',
    sourceJobId: job.job_id,
    title: job.job_title,
    company: job.employer_name || 'Company not listed',
    description: job.job_description || '',
    location: locationParts.join(', ') || 'Location not specified',
    city: job.job_city,
    region: job.job_state,
    country: job.job_country?.toLowerCase(),
    workModel: job.job_is_remote ? 'remote' : workModel === 'hybrid' ? 'hybrid' : 'local',
    employmentType: job.job_employment_type,
    applicationUrl: job.job_apply_link,
    postedAt: job.job_posted_at_datetime_utc,
    salaryMin: job.job_min_salary,
    salaryMax: job.job_max_salary,
    salaryCurrency: job.job_salary_currency,
  };
}

async function search(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  try {
    if (!params.what.trim()) {
      return { source: 'jsearch', jobs: [], ok: false, error: 'No job-search query was provided.' };
    }

    const query = new URLSearchParams({ what: params.what });
    if (params.workModel !== 'remote') {
      const where = params.destinationCity || params.destinationRegion;
      if (where) query.set('where', where);
    }
    if (params.destinationCountry) query.set('country', params.destinationCountry);
    if (params.workModel === 'remote') query.set('remoteOnly', 'true');

    const response = await fetchWithRetry(`${API_URL}/api/jobs/jsearch?${query.toString()}`, {
      timeoutMs: params.timeoutMs ?? FETCH_TIMEOUT_MS,
      isRetryableStatus: isRetryableJsearchStatus,
      signal: params.signal,
    });

    if (response.status === 501) {
      return { source: 'jsearch', jobs: [], ok: false, error: 'JSearch is not configured (no API key set).' };
    }
    if (!response.ok) {
      return { source: 'jsearch', jobs: [], ok: false, error: `JSearch API returned ${response.status}` };
    }

    const data: JSearchResponse = await response.json();

    // A schema this adapter doesn't recognize (e.g. `data` present but not
    // an array — a provider-side API change) is a controlled failure, not
    // a crash for the whole aggregated search.
    if (data.data !== undefined && data.data !== null && !Array.isArray(data.data)) {
      return { source: 'jsearch', jobs: [], ok: false, error: 'JSearch returned a malformed response.' };
    }

    // A listing with no real title is rejected outright.
    const jobs = (data.data ?? [])
      .filter((job) => Boolean(job.job_title?.trim()))
      .map((job) => mapJSearchJob(job, params.workModel));

    return { source: 'jsearch', jobs, ok: true };
  } catch (error) {
    if (error instanceof FetchAbortError) {
      return { source: 'jsearch', jobs: [], ok: false, error: error.message };
    }
    return {
      source: 'jsearch',
      jobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'JSearch search failed.',
    };
  }
}

export const jsearchProvider: JobProvider = {
  id: 'jsearch',
  supports() {
    // Configuration is a server-side secret this client can't see in
    // advance — search() itself resolves cleanly to ok:false when the key
    // is missing, so there's nothing provider-specific to gate on here.
    return true;
  },
  search,
};
