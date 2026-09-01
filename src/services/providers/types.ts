// Provider-agnostic job model. Every provider adapter maps its own API's
// response shape into this before the aggregator ever sees it, so nothing
// above this layer (dedup, destination filtering, the JobOpportunity
// mapping boundary) needs to know which API a job came from.

export type JobSource = 'adzuna' | 'arbeitnow' | 'remotive' | 'jsearch' | 'himalayas';

// Only Himalayas sets this today — its API gives an explicit pay period
// alongside minSalary/maxSalary, unlike every other current provider,
// which gives a bare (implicitly annual) figure or no period signal at
// all. See salaryFormatting.ts's formatSalary(), which appends a period
// suffix only when this is present and non-annual, so a non-annual salary
// is never displayed as if it were an annual total.
export type SalaryPeriod = 'hourly' | 'weekly' | 'fortnightly' | 'monthly' | 'annual';

// 'unknown' covers providers/listings that don't state a work model at all
// (kept distinct from 'local' so geo-filtering doesn't have to guess).
export type NormalizedWorkModel = 'local' | 'hybrid' | 'remote' | 'unknown';

export interface NormalizedJob {
  // Stable, source-prefixed id (`${source}_${sourceJobId}`) — never reused
  // across providers, so it's safe as a React key even before dedup runs.
  id: string;
  source: JobSource;
  sourceJobId: string;
  title: string;
  company: string;
  description: string;
  // Best-effort human-readable location exactly as the provider gave it —
  // always preserved, even when city/region/country below can't be split
  // out of it, so downstream text-matching (destination filtering, the
  // existing remote-eligibility heuristic) still has something to read.
  location: string;
  city?: string;
  region?: string;
  // ISO-3166-1 alpha-2, lowercase, where the provider gives (or the search
  // itself was scoped to) a real country — absent when unknown.
  country?: string;
  workModel: NormalizedWorkModel;
  // Provider's own wording (e.g. "full_time", "Traineeship") — preserved
  // as-is rather than normalized into a fixed enum, since that vocabulary
  // isn't used for any matching logic today.
  employmentType?: string;
  applicationUrl?: string;
  // ISO date string where the provider gives one.
  postedAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  // Pre-formatted fallback when the provider only gives free-text salary
  // info (or none at all parseable into min/max).
  salaryRaw?: string;
  // ISO 4217-ish currency code/symbol, ONLY when the provider's own API
  // response includes one (e.g. JSearch's job_salary_currency) — never
  // inferred from the destination country. Absent when the provider gives
  // no currency signal at all (Adzuna, Arbeitnow, Remotive today).
  salaryCurrency?: string;
  // See SalaryPeriod above. Absent for every provider except Himalayas.
  salaryPeriod?: SalaryPeriod;
  // Free-text remote-eligibility signal where a provider gives one (e.g.
  // Remotive's candidate_required_location) — preserved for later
  // eligibility/EOR reasoning, never used to silently include/exclude a
  // listing on its own.
  remoteEligibility?: string;
  // Set only by jobAggregatorService.ts's filterByDestination, only for
  // jobs kept in a 'remote' search — see geoMatch.ts's
  // classifyRemoteEligibility. 'incompatible' jobs never reach this field
  // at all (they're excluded during filtering), so only the two surviving
  // outcomes are representable here. Absent for local/hybrid jobs, where
  // eligibility isn't a relevant concept (they're already city/region
  // verified by a different mechanism).
  remoteEligibilityStatus?: 'confirmed' | 'unclear';
}

export interface ProviderSearchParams {
  // Free-text query/role, e.g. from jobQueryService.ts's deriveJobQuery().
  what: string;
  destinationCity?: string;
  destinationRegion?: string;
  // ISO-3166-1 alpha-2, lowercase.
  destinationCountry?: string;
  // Full country name, for matching against a provider's free-text
  // eligibility field (e.g. "France" inside "Open to: France, Germany").
  destinationCountryName?: string;
  workModel: 'local' | 'hybrid' | 'remote';
  // Caller-owned cancellation (e.g. an AbortController tied to a React
  // effect's lifetime in JobMatcherTab.tsx) — threaded through to each
  // provider's own fetchWithRetry() call so aborting one independent
  // search (Local/Hybrid/Remote) actually cancels its in-flight network
  // requests, not just the state update. Optional so a caller that has no
  // cancellation concept (e.g. a future non-React consumer) still works.
  signal?: AbortSignal;
  // Overrides each provider's own default fetch timeout (normally set via
  // VITE_JOB_FETCH_TIMEOUT_MS) for this specific search. Optional — mainly
  // exists so reliability tests can exercise the real timeout path quickly
  // without waiting out the production default.
  timeoutMs?: number;
}

export interface ProviderSearchResult {
  source: JobSource;
  jobs: NormalizedJob[];
  ok: boolean;
  // Present when ok is false; jobs is always [] in that case.
  error?: string;
}

export interface JobProvider {
  id: JobSource;
  // Whether this provider is even worth calling for this search (e.g.
  // Remotive only makes sense for 'remote'; Adzuna needs a supported
  // destination country). Lets the aggregator skip a call it already knows
  // can't help, without that provider-specific reasoning leaking out of
  // the provider itself.
  supports(params: ProviderSearchParams): boolean;
  // Must never throw — always resolves to a ProviderSearchResult, ok:true
  // with jobs or ok:false with an error and empty jobs. This is what lets
  // the aggregator treat "one provider failed" as routine, not exceptional.
  search(params: ProviderSearchParams): Promise<ProviderSearchResult>;
}
