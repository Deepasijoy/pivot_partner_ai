// Adzuna provider adapter. Deliberately calls the existing /api/jobs
// backend route directly (the same route src/services/jobService.ts uses)
// rather than reusing jobService.ts's own fetch code — jobService.ts must
// keep working completely unchanged for the existing direct-Adzuna path,
// so this is a small, independent duplication rather than a shared
// refactor that risks destabilizing it.

import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './types';

// Optional-chained so this module can also be imported under plain Node
// (e.g. by tests, which don't run through Vite and so have no
// import.meta.env at all) without throwing at module-load time — a no-op
// under the real Vite-built app, where import.meta.env is always present.
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000';

// Configurable so a slow environment can raise it without a code change;
// short enough that one hung request can never stall the whole aggregated
// search (see jobAggregatorService.ts's Promise.allSettled).
const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000;

// Adzuna's own documented country coverage — deliberately provider-local
// (moved out of locationService.ts, which must stay a global, provider-
// agnostic destination resolver). This never gates what a user can select
// as a PivotPartner destination; it only decides whether THIS provider is
// worth calling for a given search (see supports() below) — an
// unsupported country simply means Adzuna is skipped, other providers
// still run, and the user is never told the destination itself is
// unsupported. Sourced from Adzuna's publicly documented country list;
// re-verify against https://developer.adzuna.com before relying on this in
// production — their docs are a JS-rendered app that couldn't be scraped
// automatically while writing this, so this list is best-effort, not
// confirmed live.
const ADZUNA_SUPPORTED_COUNTRY_CODES: readonly string[] = [
  'gb', 'us', 'at', 'au', 'br', 'ca', 'de', 'fr', 'in', 'it',
  'mx', 'nl', 'nz', 'pl', 'ru', 'sg', 'za', 'es', 'se', 'ch',
];

function isAdzunaSupportedCountry(countryCode: string | undefined | null): boolean {
  if (!countryCode) return false;
  return ADZUNA_SUPPORTED_COUNTRY_CODES.includes(countryCode.toLowerCase());
}

interface AdzunaJob {
  id: string | number;
  title: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  redirect_url?: string;
  created?: string;
  contract_time?: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

function mapAdzunaJob(job: AdzunaJob, country: string | undefined): NormalizedJob {
  return {
    id: `adzuna_${job.id}`,
    source: 'adzuna',
    sourceJobId: String(job.id),
    title: job.title,
    company: job.company?.display_name || 'Company not listed',
    description: job.description || '',
    location: job.location?.display_name || 'Location not specified',
    country,
    // Adzuna's contract_time is permanent/contract, not a location model —
    // it has no local/hybrid/remote signal, so this is left 'unknown' and
    // resolved by the caller from which search (local vs remote) found it.
    workModel: 'unknown',
    employmentType: job.contract_time,
    applicationUrl: job.redirect_url,
    postedAt: job.created,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
  };
}

async function search(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  try {
    if (!params.what.trim()) {
      return { source: 'adzuna', jobs: [], ok: false, error: 'No job-search query was provided.' };
    }
    if (!params.destinationCountry) {
      return { source: 'adzuna', jobs: [], ok: false, error: 'No resolved destination country was provided.' };
    }

    const query = new URLSearchParams({
      what: params.what,
      country: params.destinationCountry,
    });

    // Matches the existing JobMatcherTab.tsx pattern: local/hybrid stays
    // scoped to the destination city/region; remote deliberately omits
    // `where` for a genuinely broader, country-wide search.
    if (params.workModel !== 'remote') {
      const where = params.destinationCity || params.destinationRegion;
      if (where) query.set('where', where);
    }

    const response = await fetchWithRetry(`${API_URL}/api/jobs?${query.toString()}`, {
      timeoutMs: params.timeoutMs ?? FETCH_TIMEOUT_MS,
      signal: params.signal,
    });
    if (!response.ok) {
      return { source: 'adzuna', jobs: [], ok: false, error: `Adzuna API returned ${response.status}` };
    }

    const data: AdzunaResponse = await response.json();

    // A schema this adapter doesn't recognize (e.g. `results` present but
    // not an array — a provider-side API change) is a controlled failure,
    // not a crash for the whole aggregated search — see
    // jobAggregatorService.ts's Promise.allSettled, which relies on every
    // provider resolving cleanly either way.
    if (data.results !== undefined && data.results !== null && !Array.isArray(data.results)) {
      return { source: 'adzuna', jobs: [], ok: false, error: 'Adzuna returned a malformed response.' };
    }

    if (!data.results || data.results.length === 0) {
      return { source: 'adzuna', jobs: [], ok: true };
    }

    return {
      source: 'adzuna',
      // A listing with no real title at all is rejected outright — there's
      // nothing honest to show for it, and it would otherwise render as a
      // blank card.
      jobs: data.results
        .filter((job) => Boolean(job.title?.trim()))
        .map((job) => mapAdzunaJob(job, params.destinationCountry)),
      ok: true,
    };
  } catch (error) {
    // An intentional cancellation (the caller's own AbortSignal, e.g.
    // JobMatcherTab.tsx superseding or unmounting this search) is not a
    // provider failure — the caller already discards this result via its
    // own stale-result guard, so this exists mainly so a genuine failure
    // is never misreported as "cancelled" or vice versa.
    if (error instanceof FetchAbortError) {
      return { source: 'adzuna', jobs: [], ok: false, error: error.message };
    }
    return {
      source: 'adzuna',
      jobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Adzuna search failed.',
    };
  }
}

export const adzunaProvider: JobProvider = {
  id: 'adzuna',
  supports(params) {
    return Boolean(params.destinationCountry) && isAdzunaSupportedCountry(params.destinationCountry);
  },
  search,
};
