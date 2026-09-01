// Himalayas provider adapter. Himalayas' public search API
// (https://himalayas.app/jobs/api/search) has no CORS headers for browser
// use, so — like jsearchProvider.ts — this calls a small backend proxy
// route (GET /api/jobs/himalayas in server/server.js) instead of the
// provider's API directly. Unlike JSearch, Himalayas requires no API key
// at all, so this route is always "configured" — there is no not-
// configured/501 case here, only ordinary network/HTTP failures.
//
// Himalayas is a remote-only job board — supports() only participates in
// 'remote' searches, exactly like remotiveProvider.ts.

import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult, SalaryPeriod } from './types';

// Optional-chained — see adzunaProvider.ts for why (importable under plain
// Node, where there is no import.meta.env at all).
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000';
const FETCH_TIMEOUT_MS = Number(import.meta.env?.VITE_JOB_FETCH_TIMEOUT_MS) || 10_000;

// Himalayas' own published docs describe locationRestrictions as an array
// of {alpha2, name, slug} objects — but live verification against the real
// API (multiple queries, dozens of jobs) consistently returned plain
// country-name strings instead (e.g. ["United States"], or the full
// restricted-country list for a job open to many countries). Both shapes
// are accepted defensively, trusting the live-observed string shape as the
// common case, so this doesn't silently break if the documented object
// shape appears for some other endpoint variant or a future API change.
type HimalayasLocationRestrictionEntry = string | { alpha2?: string; name?: string; slug?: string };

interface HimalayasJob {
  guid: string;
  title: string;
  excerpt?: string;
  companyName?: string;
  description?: string;
  applicationLink?: string;
  // Live verification found this is a Unix timestamp in SECONDS (a raw
  // number), matching arbeitnowProvider.ts's created_at exactly — despite
  // Himalayas' own docs claiming an ISO 8601 string. normalizePubDate()
  // below accepts either shape defensively.
  pubDate?: number | string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string;
  currency?: string | null;
  employmentType?: string;
  locationRestrictions?: HimalayasLocationRestrictionEntry[];
  categories?: string[];
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
}

const VALID_SALARY_PERIODS: ReadonlySet<string> = new Set(['hourly', 'weekly', 'fortnightly', 'monthly', 'annual']);

function normalizeSalaryPeriod(period: string | undefined): SalaryPeriod | undefined {
  const lower = period?.toLowerCase();
  return lower && VALID_SALARY_PERIODS.has(lower) ? (lower as SalaryPeriod) : undefined;
}

function restrictionCountryName(entry: HimalayasLocationRestrictionEntry): string | undefined {
  const name = typeof entry === 'string' ? entry : entry?.name;
  return name?.trim() || undefined;
}

// Himalayas' own documented convention: an empty locationRestrictions array
// means worldwide-eligible, a non-empty array names the specific countries
// it's restricted to. Converted to the SAME free-text eligibility signal
// every other remote provider already gives (e.g. Remotive's
// candidate_required_location: "USA", "Worldwide") — so the existing,
// shared, already-tested classifyRemoteEligibility (geoMatch.ts) can
// classify it with zero new geo logic, exactly as the task requires.
// Missing/malformed data (not an array at all) maps to undefined — "no
// signal", which classifyRemoteEligibility already treats as 'unclear',
// never a false 'confirmed'. Genuinely relies on Himalayas' own
// structured data (the country names), not free-text reconstruction — this
// is strictly more precise than Remotive's own signal, which is free text
// from the start.
function buildRemoteEligibilityText(restrictions: HimalayasLocationRestrictionEntry[] | undefined): string | undefined {
  if (!Array.isArray(restrictions)) return undefined;
  if (restrictions.length === 0) return 'Worldwide';
  const names = restrictions.map(restrictionCountryName).filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(', ') : undefined;
}

// Live verification found pubDate is a Unix timestamp in SECONDS (a raw
// number) despite Himalayas' own docs claiming ISO 8601 — see the
// HimalayasJob interface comment above. Converted the same way
// arbeitnowProvider.ts already converts its own Unix-seconds created_at
// field. A string value (matching the documented shape, in case it's ever
// actually returned) is passed through as-is; jobFreshness.ts's
// parsePostedAt already handles a genuinely unparseable string honestly.
function normalizePubDate(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  // A implausibly-large "seconds" count (> ~year 33658) is far more likely
  // to already be milliseconds — defensive against a future API change,
  // never trusted blindly either way.
  const ms = value > 1e12 ? value : value * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function mapHimalayasJob(job: HimalayasJob): NormalizedJob {
  const remoteEligibility = buildRemoteEligibilityText(job.locationRestrictions);
  return {
    id: `himalayas_${job.guid}`,
    source: 'himalayas',
    sourceJobId: job.guid,
    title: job.title,
    company: job.companyName || 'Company not listed',
    description: job.description ? job.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
    location: remoteEligibility ?? 'Remote',
    workModel: 'remote',
    employmentType: job.employmentType,
    applicationUrl: job.applicationLink,
    postedAt: normalizePubDate(job.pubDate),
    salaryMin: job.minSalary ?? undefined,
    salaryMax: job.maxSalary ?? undefined,
    salaryCurrency: job.currency ?? undefined,
    salaryPeriod: normalizeSalaryPeriod(job.salaryPeriod),
    remoteEligibility,
  };
}

// Loose, additive relevance safety net — same shape and same rationale as
// remotiveProvider.ts's isRelevant() (Step F precedent): Himalayas' `q`
// search param narrows candidates but isn't assumed sufficient on its own
// for niche/non-tech queries, so a result is removed only when NONE of the
// query's significant words appear anywhere in its title, categories, or
// description. A well-filtered query is essentially unaffected; a
// legitimate adjacent role still passes as long as its description/
// categories mention related vocabulary — real occupation-aware scoring
// happens downstream in occupationMatchingService.ts.
function isRelevant(job: HimalayasJob, what: string): boolean {
  const words = what
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return true;
  const haystack = `${job.title} ${job.excerpt ?? ''} ${(job.categories ?? []).join(' ')} ${job.description ?? ''}`.toLowerCase();
  return words.some((word) => haystack.includes(word));
}

async function search(params: ProviderSearchParams): Promise<ProviderSearchResult> {
  try {
    const query = new URLSearchParams({ page: '1' });
    if (params.what.trim()) query.set('q', params.what);
    // Himalayas' own `country` filter naturally includes both
    // country-specific AND worldwide-eligible jobs together when set
    // (leaving `exclude_worldwide` unset) — exactly the "include
    // worldwide-compatible jobs appropriately" behavior asked for, with no
    // extra parameters needed.
    if (params.destinationCountry) query.set('country', params.destinationCountry);

    const response = await fetchWithRetry(`${API_URL}/api/jobs/himalayas?${query.toString()}`, {
      timeoutMs: params.timeoutMs ?? FETCH_TIMEOUT_MS,
      signal: params.signal,
    });
    if (!response.ok) {
      return { source: 'himalayas', jobs: [], ok: false, error: `Himalayas API returned ${response.status}` };
    }

    const data: HimalayasResponse = await response.json();

    // A schema this adapter doesn't recognize (e.g. `jobs` present but not
    // an array — a provider-side API change) is a controlled failure, not
    // a crash for the whole aggregated search.
    if (!Array.isArray(data.jobs)) {
      return { source: 'himalayas', jobs: [], ok: false, error: 'Himalayas returned a malformed response.' };
    }

    // A listing with no real title is rejected outright — nothing honest
    // to show for it. isRelevant() is the client-side relevance safety
    // net described above.
    const jobs = data.jobs
      .filter((job) => Boolean(job.title?.trim()))
      .filter((job) => isRelevant(job, params.what))
      .map(mapHimalayasJob);

    return { source: 'himalayas', jobs, ok: true };
  } catch (error) {
    if (error instanceof FetchAbortError) {
      return { source: 'himalayas', jobs: [], ok: false, error: error.message };
    }
    return {
      source: 'himalayas',
      jobs: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Himalayas search failed.',
    };
  }
}

export const himalayasProvider: JobProvider = {
  id: 'himalayas',
  supports(params) {
    // Himalayas is a remote-only job board — it has no local/hybrid
    // listings, and must never participate in those searches.
    return params.workModel === 'remote';
  },
  search,
};
