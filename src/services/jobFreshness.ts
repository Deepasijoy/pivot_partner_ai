// Job-posting freshness — a small, pure module in the same spirit as
// salaryFormatting.ts: takes only the raw `postedAt` string a provider
// gave (an ISO date, where the provider gives one at all), never invents
// one, and never hard-excludes a job merely for being old or dateless.
//
// Real provider data inspected before choosing DEFAULT_FRESHNESS_WINDOW_DAYS
// below (Adzuna via the live /api/jobs route, Arbeitnow and Remotive via
// their own public APIs directly — France/"Data Analyst"-style queries):
//   - Adzuna: ages ranged from ~3 days to ~591 days old in the same result
//     page — genuinely stale-looking listings are mixed in with fresh ones,
//     and Adzuna gives no separate "still open" signal to tell them apart.
//     A hard cutoff anywhere in a normal range would have discarded several
//     real, presumably-still-open results.
//   - Remotive: consistently recent in samples taken (single digit to
//     ~25 days).
//   - Arbeitnow: consistently same-day (it only ever serves a live "page 1
///    of recent listings" feed, confirmed in arbeitnowProvider.ts's own
//     comments).
// Conclusion: staleness varies far too widely (especially on Adzuna) to
// safely exclude jobs by age without risking "higher-quality but fewer
// results" turning into "fewer results, arbitrarily." So freshness here is
// informational only — it drives display text and sort order, never
// inclusion/exclusion.

export const DEFAULT_FRESHNESS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses a provider's raw `postedAt` string into a real Date, or null when
 * it isn't one — covers missing/empty values, genuinely unparseable
 * strings (`new Date(...)` producing an Invalid Date), and a value more
 * than a day in the future (a provider clock-skew/malformed-data artifact,
 * not a real posting date — never trusted, never silently accepted).
 * Deliberately has no lower bound: real Adzuna data confirmed legitimate
 * listings well over a year old, so an old-but-valid date is never treated
 * as malformed on age alone.
 */
export function parsePostedAt(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > Date.now() + DAY_MS) return null;
  return date;
}

/**
 * True only when `value` parses to a real date within `windowDays` of now.
 * Purely informational (drives a "posted recently" label) — never used to
 * exclude a job; a false result here says nothing about whether the job is
 * still open, only that it isn't confirmed recent.
 */
export function isRecentlyPosted(
  value: string | undefined | null,
  windowDays: number = DEFAULT_FRESHNESS_WINDOW_DAYS
): boolean {
  const date = parsePostedAt(value);
  if (!date) return false;
  return Date.now() - date.getTime() <= windowDays * DAY_MS;
}

/**
 * A short, honest, relative-time label ("Posted today", "Posted 3 days
 * ago", "Posted 2 weeks ago", "Posted 4 months ago") — or null when
 * `value` is missing/unparseable, so a caller can omit the line entirely
 * rather than claim a freshness that isn't known.
 */
export function formatRelativePostedAt(value: string | undefined | null): string | null {
  const date = parsePostedAt(value);
  if (!date) return null;

  const ageMs = Math.max(0, Date.now() - date.getTime());
  const ageDays = Math.floor(ageMs / DAY_MS);

  if (ageDays === 0) return 'Posted today';
  if (ageDays === 1) return 'Posted yesterday';
  if (ageDays < 7) return `Posted ${ageDays} days ago`;
  if (ageDays < 30) {
    const weeks = Math.floor(ageDays / 7);
    return `Posted ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (ageDays < 365) {
    const months = Math.floor(ageDays / 30);
    return `Posted ${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(ageDays / 365);
  return `Posted ${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Sorts jobs by freshness — newest first among jobs with a valid, parseable
 * `postedAt`; every job with a missing/unparseable date is placed after all
 * dated jobs, in their original relative order (Array.prototype.sort is
 * stable). Never drops a job. Accepts and returns the raw postedAt string
 * so it can compare any two objects that carry one (NormalizedJob today).
 */
export function comparePostedAtDescending(a: string | undefined, b: string | undefined): number {
  const dateA = parsePostedAt(a);
  const dateB = parsePostedAt(b);
  if (dateA && dateB) return dateB.getTime() - dateA.getTime();
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  return 0;
}
