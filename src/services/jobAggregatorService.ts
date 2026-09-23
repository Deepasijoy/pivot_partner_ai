// Multi-provider job aggregation: calls every applicable provider in
// parallel, tolerates individual provider failures, deduplicates, and
// applies destination/work-model geographic filtering — then maps the
// result down to the existing JobOpportunity shape so nothing above this
// layer (CareerRecommendations.tsx, recommendationService.ts,
// matchingService.ts, skillAnalysisService.ts) needs to change.
//
// Every provider in PRIMARY_PROVIDERS below (including Remotive — see its
// own comment) is queried together, in parallel, on every applicable
// search — there is no separate fallback phase anymore (feat-remotive-
// cached retired the old "Remotive only when everything else returns
// zero" gating, now that Remotive is backed by a locally-searched cache
// rather than a live per-search call — see providers/remotiveProvider.ts
// and server/services/remotiveCache.js).
//
// Deliberately does NOT touch jobService.ts's existing loadJobOpportunities
// — that remains a fully independent, working direct-Adzuna path (see its
// own file for why). This aggregator is additive.

import type { JobOpportunity, WorkModel } from '../types';
import { detectSkills } from './jobService';
import { formatSalary } from './salaryFormatting';
import { adzunaProvider } from './providers/adzunaProvider';
import { arbeitnowProvider } from './providers/arbeitnowProvider';
import { remotiveProvider } from './providers/remotiveProvider';
import { jsearchProvider } from './providers/jsearchProvider';
import { himalayasProvider } from './providers/himalayasProvider';
import { cityOrRegionMatchesLocationText, classifyRemoteEligibility } from './providers/geoMatch';
import { comparePostedAtDescending } from './jobFreshness';
import { assessPortability, assessEorHiring, type PortabilityUser } from './portabilityService';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './providers/types';

// Every provider queried up front, in parallel, on every applicable
// search. Remotive is included here now (feat-remotive-cached) — it used
// to be excluded and called only as a last-resort fallback because a live
// Remotive call on every search would have blown through their API's
// request-frequency terms; now that remotiveProvider.ts calls this app's
// own cached backend proxy instead of Remotive directly, a real Remotive
// request only happens on the cache's own 6-hourly refresh, completely
// decoupled from how many searches run — so it's safe to treat exactly
// like every other provider.
const PRIMARY_PROVIDERS: JobProvider[] = [
  adzunaProvider,
  arbeitnowProvider,
  remotiveProvider,
  jsearchProvider,
  himalayasProvider,
];

export interface AggregatedSearchParams {
  // A ranked list of query terms to try — every term is sent to every
  // applicable provider, in parallel, and the combined raw results go
  // through the same geo-filter + dedup pipeline together (see
  // searchJobs()), so the same posting surfacing under two different terms
  // just collapses to one entry rather than being fetched twice. A plain
  // string is still accepted (equivalent to a single-element array) so
  // every existing caller/test keeps working unchanged.
  what: string | string[];
  destinationCity?: string;
  destinationRegion?: string;
  destinationCountry?: string;
  destinationCountryName?: string;
  // 'freelance' has no live provider (see CareerRecommendations.tsx — no
  // provider here offers a reliable freelance/gig signal either); callers
  // should not call searchJobs() for it, but it's accepted and handled
  // honestly rather than mis-typed away.
  workModel: WorkModel;
  // Caller-owned cancellation — see providers/types.ts's ProviderSearchParams.signal.
  // Aborting this cancels every in-flight provider request for this
  // specific search without affecting any other independent search.
  signal?: AbortSignal;
  // See providers/types.ts's ProviderSearchParams.timeoutMs.
  timeoutMs?: number;
}

// Mirrors jobService.ts's existing JobFetchSource contract exactly, so a
// caller (JobMatcherTab.tsx) can treat this result identically to the
// existing loadJobOpportunities() result.
export type AggregatedSearchSource = 'live' | 'empty' | 'error';

export interface AggregatedSearchResult {
  jobs: JobOpportunity[];
  source: AggregatedSearchSource;
  reason?: string;
  // Per-provider outcome — not consumed by the existing UI, kept for
  // debugging/logging and so a future UI could surface "3 of 4 providers
  // responded" without another round trip.
  providerResults: ProviderSearchResult[];
}

function normalizeForFingerprint(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A description is trusted as a dedup signal only once it's long enough to
// meaningfully distinguish two postings — an empty/very short description
// (some providers give none at all) falls back to the original
// location-based key instead, rather than letting two unrelated jobs that
// both happen to lack a description collide on an empty string.
const MIN_DESCRIPTION_FINGERPRINT_LENGTH = 20;
const DESCRIPTION_FINGERPRINT_MAX_LENGTH = 300;

// Confirmed live (see jobAggregatorService.deduplication.test.ts and the
// QA that found it): a recruiter's exact same remote vacancy can be
// returned by a single provider multiple times, once per city it was
// cross-posted to — same title, same company, same description, same
// posting timestamp, but a DIFFERENT `location.display_name` and a
// DIFFERENT redirect/application URL per copy (each city re-post gets its
// own ad id). For a REMOTE search, the listed city is exactly that kind of
// noise, not a distinguishing feature of a genuinely different opportunity
// — unlike a LOCAL/HYBRID search, where two identically-titled postings at
// two different real offices legitimately are two different jobs a
// candidate might choose between, so location must keep mattering there.
function fingerprint(job: NormalizedJob, workModel: 'local' | 'hybrid' | 'remote'): string {
  const titleKey = normalizeForFingerprint(job.title);
  const companyKey = normalizeForFingerprint(job.company);

  if (workModel === 'remote') {
    const descriptionKey = normalizeForFingerprint(job.description).slice(0, DESCRIPTION_FINGERPRINT_MAX_LENGTH);
    if (descriptionKey.length >= MIN_DESCRIPTION_FINGERPRINT_LENGTH) {
      return `${titleKey}|${companyKey}|desc:${descriptionKey}`;
    }
  }

  const locationKey = normalizeForFingerprint(job.city || job.region || job.location);
  return `${titleKey}|${companyKey}|${locationKey}`;
}

/**
 * The same underlying job frequently appears on more than one board with
 * different provider-specific IDs — so IDs alone can't be used to dedupe.
 * Two passes: an exact application-URL match first (the strongest
 * signal when available), then a normalized fingerprint (see fingerprint()
 * above — title+company+location for local/hybrid, title+company+
 * description for remote, when a description is available). First
 * occurrence wins; source/provider info is preserved on whichever copy is
 * kept (NormalizedJob.source), not merged.
 */
export function deduplicateJobs(jobs: NormalizedJob[], workModel: 'local' | 'hybrid' | 'remote' = 'local'): NormalizedJob[] {
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: NormalizedJob[] = [];

  for (const job of jobs) {
    const urlKey = job.applicationUrl?.trim().toLowerCase();
    if (urlKey && seenUrls.has(urlKey)) continue;

    const fp = fingerprint(job, workModel);
    if (seenFingerprints.has(fp)) continue;

    if (urlKey) seenUrls.add(urlKey);
    seenFingerprints.add(fp);
    result.push(job);
  }

  return result;
}

/**
 * Applies the destination/work-model geographic rules:
 *  - LOCAL/HYBRID: destination city/region is a hard requirement; a job
 *    tagged 'remote' never qualifies (it isn't "in the destination area").
 *  - REMOTE: destination country is the constraint, city/region is not —
 *    a job explicitly tagged local/hybrid never qualifies. A job's
 *    eligibility for the destination is classified (see geoMatch.ts's
 *    classifyRemoteEligibility): an explicit country/region match is kept
 *    and tagged 'confirmed'; an explicit, different country/region is
 *    excluded; genuinely missing signal is kept — never hard-excluded on
 *    missing data — but tagged 'unclear' rather than silently treated as
 *    confirmed, so the UI can be honest about the uncertainty (see
 *    CareerRecommendations.tsx).
 */
export function filterByDestination(jobs: NormalizedJob[], params: ProviderSearchParams): NormalizedJob[] {
  if (params.workModel === 'remote') {
    const kept: NormalizedJob[] = [];

    for (const job of jobs) {
      if (job.workModel === 'local' || job.workModel === 'hybrid') continue;

      if (!params.destinationCountry) {
        kept.push(job);
        continue;
      }

      if (job.country) {
        // A structured country field is the strongest signal a provider
        // can give — trusted directly, no free-text classification needed.
        if (job.country.toLowerCase() === params.destinationCountry.toLowerCase()) {
          kept.push({ ...job, remoteEligibilityStatus: 'confirmed' });
        }
        continue;
      }

      const status = classifyRemoteEligibility(
        params.destinationCountryName,
        params.destinationCountry,
        job.remoteEligibility
      );
      if (status === 'incompatible') continue;
      kept.push({ ...job, remoteEligibilityStatus: status });
    }

    return kept;
  }

  // local / hybrid
  return jobs.filter((job) => {
    if (job.workModel === 'remote') return false;
    if (job.country && params.destinationCountry && job.country.toLowerCase() !== params.destinationCountry.toLowerCase()) {
      return false;
    }
    const locationText = job.location || [job.city, job.region].filter(Boolean).join(', ');
    return cityOrRegionMatchesLocationText(params.destinationCity, params.destinationRegion, locationText);
  });
}

// Mapping boundary: NormalizedJob -> the existing UI-facing JobOpportunity.
// Deliberately produces the exact same shape jobService.ts's mapAdzunaJob
// already does, so CareerRecommendations.tsx/recommendationService.ts/
// matchingService.ts/skillAnalysisService.ts/remoteEligibilityService.ts
// all keep working completely unchanged.
//
// `portabilityUser` is passed only for a live 'remote' search with a
// resolved destination (see searchJobs() below) — computed here, once,
// while the full NormalizedJob (country, remoteEligibility) is still
// available, rather than in the UI layer where remoteEligibility has
// already been folded into `description` text below and `country` isn't
// carried through JobOpportunity at all. Local/Hybrid calls omit it, so
// `portability`/`eor` stay undefined there — those work models have no
// portability concept (see CareerRecommendations.tsx, which only renders
// the badge for Remote).
function toJobOpportunity(job: NormalizedJob, portabilityUser?: PortabilityUser): JobOpportunity {
  // Folds the remote-eligibility free text (e.g. Remotive's
  // candidate_required_location) into the description text, so the
  // existing remoteEligibilityService.ts regex-based detector — which
  // already scans `description` for restriction/worldwide/EOR phrases —
  // gets a chance to see it too, with zero changes to that file.
  const description = job.remoteEligibility
    ? `${job.description}\n\nEligible locations: ${job.remoteEligibility}`
    : job.description;

  const requiredSkills = detectSkills(`${job.title} ${description}`);

  return {
    id: job.id,
    title: job.title,
    company: job.company || 'Company not listed',
    salaryRange: formatSalary(job),
    timezone: job.location || 'Location not specified',
    matchScore: 0,
    requiredSkills,
    matchedSkills: [],
    missingSkills: requiredSkills,
    description,
    employmentMatch: 0,
    applyUrl: job.applicationUrl,
    postedAt: job.postedAt,
    source: job.source,
    remoteEligibilityStatus: job.remoteEligibilityStatus,
    portability: portabilityUser
      ? assessPortability({ title: job.title, description: job.description, remoteEligibility: job.remoteEligibility }, portabilityUser)
      : undefined,
    eor: portabilityUser
      ? assessEorHiring({ title: job.title, description: job.description, remoteEligibility: job.remoteEligibility })
      : undefined,
  };
}

// Runs every given provider in parallel and always resolves to one
// ProviderSearchResult per provider — a provider throwing (it never should;
// see JobProvider.search's own contract) is defense-in-depth, converted to
// a normal ok:false result rather than rejecting the whole batch.
async function runProviders(providers: JobProvider[], providerParams: ProviderSearchParams): Promise<ProviderSearchResult[]> {
  if (providers.length === 0) return [];

  const settled = await Promise.allSettled(providers.map((provider) => provider.search(providerParams)));

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const source = providers[index].id;
    const message = result.reason instanceof Error ? result.reason.message : 'Unknown provider error';
    console.warn(`[jobAggregatorService] provider "${source}" threw unexpectedly:`, result.reason);
    return { source, jobs: [], ok: false, error: message };
  });
}

function logProviderResults(results: ProviderSearchResult[]): void {
  for (const result of results) {
    if (!result.ok) {
      console.warn(`[jobAggregatorService] provider "${result.source}" failed: ${result.error}`);
    } else {
      console.debug(`[jobAggregatorService] provider "${result.source}" returned ${result.jobs.length} job(s)`);
    }
  }
}

// Runs a provider batch's jobs through the same geo filter + dedup steps
// every query term uses — kept as one small helper so they never drift
// into applying these two steps differently.
function geoFilterAndDedupe(jobs: NormalizedJob[], providerParams: ProviderSearchParams): NormalizedJob[] {
  return deduplicateJobs(filterByDestination(jobs, providerParams), providerParams.workModel);
}

export async function searchJobs(params: AggregatedSearchParams): Promise<AggregatedSearchResult> {
  if (params.workModel === 'freelance') {
    return {
      jobs: [],
      source: 'error',
      reason: 'No live freelance data source exists.',
      providerResults: [],
    };
  }

  // Narrowed to a local const so it keeps its 'local' | 'hybrid' | 'remote'
  // type inside the providerParamsFor closure below — TS's narrowing from
  // the freelance check above doesn't survive a `params.workModel` access
  // through a nested function literal, only through a local variable.
  const workModel = params.workModel;

  const queries = [
    ...new Set((Array.isArray(params.what) ? params.what : [params.what]).map((q) => q.trim()).filter(Boolean)),
  ];
  if (queries.length === 0) {
    return { jobs: [], source: 'error', reason: 'No job-search query was provided.', providerResults: [] };
  }

  const providerParamsFor = (what: string): ProviderSearchParams => ({
    what,
    destinationCity: params.destinationCity,
    destinationRegion: params.destinationRegion,
    destinationCountry: params.destinationCountry,
    destinationCountryName: params.destinationCountryName,
    workModel,
    signal: params.signal,
    timeoutMs: params.timeoutMs,
  });

  // supports() only depends on destination/workModel (see
  // providers/types.ts), never on `what` — safe to gate once using any
  // query term as a stand-in.
  const primaryApplicable = PRIMARY_PROVIDERS.filter((provider) => provider.supports(providerParamsFor(queries[0])));

  if (primaryApplicable.length === 0) {
    return {
      jobs: [],
      source: 'error',
      reason: 'No job provider supports this destination/work-model combination.',
      providerResults: [],
    };
  }

  // Runs every applicable primary provider for one query term, with the
  // same visible (console.log, not console.debug) per-term breakdown as
  // before: a single flattened total can't show which specific term a
  // provider's raw (pre geo-filter/dedup) count came from, which is
  // exactly what's needed to tell "a bad query term zeroed everyone out"
  // apart from "a fine term's results were filtered/deduped away later".
  const runQuery = async (what: string) => {
    const results = await runProviders(primaryApplicable, providerParamsFor(what));
    console.log(
      `[jobAggregatorService] raw results for query "${what}":`,
      results.map((r) => `${r.source}=${r.ok ? r.jobs.length : `FAILED(${r.error})`}`).join(', ')
    );
    return results;
  };

  // primaryQuery is tried first, across every applicable provider
  // (including Remotive — see PRIMARY_PROVIDERS above), in parallel.
  // alternateQueries are fanned out too, but ONLY if primaryQuery's own
  // (geo-filtered, deduped) results come back empty — not unconditionally
  // alongside it. Every extra query term multiplies outbound request
  // volume against providers with real request caps (Adzuna's free tier is
  // a low, real quota), for no benefit in the common case where
  // primaryQuery alone already finds something; this still gets a
  // candidate resume's full alternate-cluster coverage (Data Analyst /
  // Business Intelligence Analyst / Data Scientist, e.g.) exactly when
  // it's actually needed — when the first term alone found nothing — at
  // the cost of running those extra queries sequentially after
  // primaryQuery rather than concurrently with it, only in that already-
  // slower empty-first-try case.
  const [primaryQuery, ...alternateQueries] = queries;
  let primaryResults = await runQuery(primaryQuery);
  let primaryDeduped = geoFilterAndDedupe(
    primaryResults.flatMap((result) => result.jobs),
    providerParamsFor(primaryQuery)
  );

  if (primaryDeduped.length === 0 && alternateQueries.length > 0) {
    const alternateResultsByQuery = await Promise.all(alternateQueries.map(runQuery));
    primaryResults = [...primaryResults, ...alternateResultsByQuery.flat()];
    primaryDeduped = geoFilterAndDedupe(
      primaryResults.flatMap((result) => result.jobs),
      providerParamsFor(primaryQuery)
    );
  }

  logProviderResults(primaryResults);

  const finalDeduped = primaryDeduped;
  const allProviderResults = primaryResults;

  const anySucceeded = allProviderResults.some((result) => result.ok);
  if (!anySucceeded) {
    return {
      jobs: [],
      source: 'error',
      reason: allProviderResults
        .filter((r) => r.error)
        .map((r) => `${r.source}: ${r.error}`)
        .join('; ') || 'All job providers failed.',
      providerResults: allProviderResults,
    };
  }

  if (finalDeduped.length === 0) {
    return {
      jobs: [],
      source: 'empty',
      reason: 'No usable jobs found across providers for this search.',
      providerResults: allProviderResults,
    };
  }

  // Prefer recently posted jobs — never excludes anything (see
  // jobFreshness.ts): jobs with a valid, parseable postedAt sort newest
  // first; jobs with a missing/unparseable date are placed after all dated
  // jobs, in their original relative order (stable sort), never dropped.
  const bySortedFreshness = [...finalDeduped].sort((a, b) => comparePostedAtDescending(a.postedAt, b.postedAt));

  // Portability (see portabilityService.ts) only has meaning for a Remote
  // search with a resolved destination — Local/Hybrid jobs are already
  // destination-verified by the geo filter above, so the concept doesn't
  // apply there at all.
  const portabilityUser: PortabilityUser | undefined =
    workModel === 'remote' && params.destinationCountry && params.destinationCountryName
      ? { countryCode: params.destinationCountry, countryName: params.destinationCountryName }
      : undefined;

  return {
    jobs: bySortedFreshness.map((job) => toJobOpportunity(job, portabilityUser)),
    source: 'live',
    providerResults: allProviderResults,
  };
}
