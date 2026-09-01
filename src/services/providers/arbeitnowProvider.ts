// Arbeitnow provider adapter. Public, no API key (Access-Control-Allow-
// Origin: *), so this calls the API directly from the browser.
//
// Confirmed by direct testing before writing this: the job-board-api
// endpoint's `search`/`location`/`tags[]` query params do NOT filter
// server-side — every combination returned the same unfiltered page. So
// this provider fetches a page of recent listings and filters locally by
// query relevance and destination — a provider-contained limitation, kept
// out of the aggregator per the "no provider-specific logic outside the
// adapter" rule.

import { cityOrRegionMatchesLocationText } from './geoMatch';
import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './types';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';

const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000;

// Exported only so mapArbeitnowJob below is unit-testable directly, without
// mocking the network call in search().
export interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location: string;
  created_at: number; // unix seconds
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

function inferWorkModel(job: ArbeitnowJob): NormalizedJob['workModel'] {
  if (job.remote) return 'remote';
  const text = `${job.title} ${(job.job_types ?? []).join(' ')}`.toLowerCase();
  if (text.includes('hybrid')) return 'hybrid';
  return 'local';
}

export function mapArbeitnowJob(job: ArbeitnowJob): NormalizedJob {
  return {
    id: `arbeitnow_${job.slug}`,
    source: 'arbeitnow',
    sourceJobId: job.slug,
    title: job.title,
    // Descriptions are raw HTML from the source — stripped to plain text
    // so downstream skill-detection (which scans this as prose) isn't
    // matching against markup, and so it reads sensibly if ever shown.
    description: job.description ? job.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
    company: job.company_name || 'Company not listed',
    location: job.location || 'Location not specified',
    workModel: inferWorkModel(job),
    employmentType: job.job_types?.join(', '),
    applicationUrl: job.url,
    postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : undefined,
  };
}

// Loose relevance filter — the provider gives us no query filtering at
// all, so without this every search would return the same ~175 mostly
// irrelevant jobs. Matches if any significant word of the query appears in
// the title (case-insensitive); a query with no significant words (e.g.
// all stopwords) matches everything rather than nothing.
function isRelevant(job: ArbeitnowJob, what: string): boolean {
  const words = what
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return true;
  const haystack = job.title.toLowerCase();
  return words.some((word) => haystack.includes(word));
}

async function search(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  try {
    const response = await fetchWithRetry(`${API_URL}?page=1`, {
      timeoutMs: params.timeoutMs ?? FETCH_TIMEOUT_MS,
      signal: params.signal,
    });
    if (!response.ok) {
      return { source: 'arbeitnow', jobs: [], ok: false, error: `Arbeitnow API returned ${response.status}` };
    }

    const data: ArbeitnowResponse = await response.json();

    // A schema this adapter doesn't recognize (e.g. `data` present but not
    // an array — a provider-side API change) is a controlled failure, not
    // a crash for the whole aggregated search.
    if (!Array.isArray(data.data)) {
      return { source: 'arbeitnow', jobs: [], ok: false, error: 'Arbeitnow returned a malformed response.' };
    }

    const relevant = data.data
      // A listing with no real title is rejected outright — nothing
      // honest to show for it.
      .filter((job) => Boolean(job.title?.trim()))
      .filter((job) => isRelevant(job, params.what));

    const jobs = relevant
      .map(mapArbeitnowJob)
      .filter((job) => {
        if (params.workModel === 'remote') return job.workModel === 'remote';
        // local/hybrid — Arbeitnow gives no structured country, so
        // geographic matching relies entirely on the location text.
        return (
          job.workModel !== 'remote' &&
          cityOrRegionMatchesLocationText(params.destinationCity, params.destinationRegion, job.location)
        );
      });

    return { source: 'arbeitnow', jobs, ok: true };
  } catch (error) {
    if (error instanceof FetchAbortError) {
      return { source: 'arbeitnow', jobs: [], ok: false, error: error.message };
    }
    return {
      source: 'arbeitnow',
      jobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Arbeitnow search failed.',
    };
  }
}

export const arbeitnowProvider: JobProvider = {
  id: 'arbeitnow',
  // Always attempted — cheap, unauthenticated, single request. Its own
  // destination filter above naturally yields zero results for a
  // destination it has no relevant listings for, which is correct, not an
  // error.
  supports() {
    return true;
  },
  search,
};
