// Remotive provider adapter. Promoted from a fallback-only source to a
// regular primary provider (feat-remotive-cached) — but Remotive's own API
// terms cap real requests at roughly 4/day and forbid calling it per user
// search, so this NEVER talks to Remotive's live API directly anymore.
// Instead it calls this app's own backend proxy (GET /api/jobs/remotive,
// server.js), which is backed by server/services/remotiveCache.js — a
// snapshot refreshed at most once every 6 hours (Supabase-persisted so it
// survives a Render free-tier sleep/restart), searched locally against
// that snapshot rather than hitting Remotive again. See that file's own
// header comment for the full terms and the live-behavior finding that
// motivated this (Remotive's own search/category params currently have no
// effect — their endpoint is served from a Cloudflare edge cache that
// ignores query strings — so the cache's local search is doing the only
// real filtering that happens today).
//
// Remotive is a remote-only job board — there is no local/hybrid listing
// to return, so this provider only participates in 'remote' searches
// (supports() below).

import { fetchWithRetry, FetchAbortError } from '../../utils/fetchWithRetry';
import { JOB_FETCH_TIMEOUT_MS } from './jobFetchTimeout';
import type { JobProvider, NormalizedJob, ProviderSearchParams, ProviderSearchResult } from './types';

// Optional-chained — see adzunaProvider.ts for why (importable under plain
// Node, where there is no import.meta.env at all).
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3000';
// Proxied through this app's own backend now (see the module comment
// above) — shares jobFetchTimeout.ts's cold-start-aware default for the
// same reason jsearchProvider.ts/himalayasProvider.ts do.

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
  // eligibility signal any of these providers gives; used directly by
  // services/portabilityService.ts for the portability badge.
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

function mapRemotiveJob(job: RemotiveJob, applyLinkIsGeneric: boolean): NormalizedJob {
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
    // Remotive's own job page — required by their API terms (link back
    // to Remotive, never a copied/redirected company URL) — job.url
    // already is that Remotive page, unmodified.
    applicationUrl: job.url,
    postedAt: job.publication_date,
    salaryRaw: job.salary || undefined,
    remoteEligibility: job.candidate_required_location,
    applyLinkIsGeneric: applyLinkIsGeneric || undefined,
  };
}

// Remotive's API gives no dedicated "apply URL" field distinct from
// `url` (Remotive's own per-job page, always unique — that's what
// applicationUrl above is). The real external application destination,
// when the employer uses one (e.g. a staffing agency's own site), is only
// ever embedded inline in the job's HTML description as an ordinary
// <a href> — confirmed by direct inspection while investigating a real
// case (four differently-titled "roles" — AI Engineer, .NET Developer,
// Data Scientist, React Developer — whose descriptions all linked to
// lemon.io/for-developers, a generic talent-marketplace signup page, not
// a page about any of those specific roles). Returns the link normalized
// to origin+pathname (tracking query params like utm_campaign stripped)
// so that real case — where the four links differed only by their
// campaign parameter — is actually caught; an exact full-URL comparison
// would have missed it entirely. Returns undefined for a link to
// Remotive itself, or when the description has no link at all (most jobs
// apply directly on Remotive, which this is not trying to flag).
function extractExternalDescriptionLink(description: string | undefined): string | undefined {
  if (!description) return undefined;
  for (const match of description.matchAll(/<a\s[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1]);
      if (!url.hostname.endsWith('remotive.com')) {
        return `${url.origin}${url.pathname}`;
      }
    } catch {
      // Not a valid absolute URL (e.g. a relative "#" anchor) — skip it.
    }
  }
  return undefined;
}

// Flags every job whose description's external link (see above) is
// shared by 2+ OTHER postings in this same fetch — i.e. the link appears
// on 3 or more jobs in total. Deliberately never used to drop/hide a
// posting: the role itself may still be genuine even if its apply link
// turns out to be a generic recruiter funnel, so this only marks it for
// the UI to disclose (CareerRecommendations.tsx), never to exclude it.
function detectGenericApplyLinks(jobs: RemotiveJob[]): Map<number, boolean> {
  const jobIdToLink = new Map<number, string>();
  const linkToJobIds = new Map<string, number[]>();

  for (const job of jobs) {
    const link = extractExternalDescriptionLink(job.description);
    if (!link) continue;
    jobIdToLink.set(job.id, link);
    linkToJobIds.set(link, [...(linkToJobIds.get(link) ?? []), job.id]);
  }

  const flagged = new Map<number, boolean>();
  for (const job of jobs) {
    const link = jobIdToLink.get(job.id);
    const groupSize = link ? (linkToJobIds.get(link)?.length ?? 0) : 0;
    flagged.set(job.id, groupSize >= 3);
  }
  return flagged;
}

// Loose, additive relevance safety net — the backend cache (see the module
// comment above) already filters by `search` against the same title/
// category/description/tags text before this ever runs; this is a second,
// client-side pass in case that filtering ever loosens, consistent with
// Himalayas' own isRelevant() (which keeps a client-side check too despite
// Himalayas' backend also filtering server-side). Removes a result only
// when NONE of the query's significant words appear anywhere in its
// title, category, or description — not an occupation classifier; real
// occupation-aware scoring happens downstream in occupationMatchingService.ts.
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
    const response = await fetchWithRetry(`${API_URL}/api/jobs/remotive?${query.toString()}`, {
      timeoutMs: params.timeoutMs ?? JOB_FETCH_TIMEOUT_MS,
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

    // Computed across the full fetch (every job this call got back, before
    // the title/relevance filters below) — a job that gets filtered out
    // here should still count toward flagging its surviving siblings that
    // share its link.
    const genericApplyLinkFlags = detectGenericApplyLinks(data.jobs);

    // A listing with no real title is rejected outright.
    const jobs = data.jobs
      .filter((job) => Boolean(job.title?.trim()))
      .filter((job) => isRelevant(job, params.what))
      .map((job) => mapRemotiveJob(job, genericApplyLinkFlags.get(job.id) ?? false));

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
