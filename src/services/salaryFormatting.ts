// Formats a job's salary fields for display. Pure and provider-agnostic —
// takes only the salary-related fields it needs, not a full NormalizedJob,
// so it stays trivially testable and reusable.
//
// Currency handling: a currency is shown ONLY when the source job itself
// carries one (today, only JSearch's job_salary_currency does — see
// providers/jsearchProvider.ts). It is never inferred from the destination
// country or any other context — a provider that gives numeric salary
// figures with no currency signal (Adzuna, Arbeitnow) renders the same
// bare-number range as before this change, so a range that was previously
// shown is never suppressed.
export interface SalaryFields {
  salaryMin?: number;
  salaryMax?: number;
  salaryRaw?: string;
  salaryCurrency?: string;
  // Only Himalayas sets this today (see providers/types.ts's
  // SalaryPeriod). Every other provider gives a bare figure that has
  // always been displayed with no period at all — appending a suffix only
  // when this is present and non-annual keeps that exact existing output
  // byte-for-byte, while ensuring a non-annual salary (e.g. "$50/hour")
  // is never shown as if it were an annual total.
  salaryPeriod?: 'hourly' | 'weekly' | 'fortnightly' | 'monthly' | 'annual';
}

const PERIOD_SUFFIX: Partial<Record<NonNullable<SalaryFields['salaryPeriod']>, string>> = {
  hourly: '/hour',
  weekly: '/week',
  fortnightly: '/2 weeks',
  monthly: '/month',
  // 'annual' intentionally has no suffix — it's the same implicit
  // convention every existing figure (Adzuna, Arbeitnow, JSearch) already
  // reads as with no period shown at all.
};

function periodSuffix(period: SalaryFields['salaryPeriod']): string {
  return period ? PERIOD_SUFFIX[period] ?? '' : '';
}

// A provider's schema can drift or return an unexpected shape (a string
// like "N/A", null, NaN, a negative placeholder) despite what its own type
// declares — this is the last line of defense before a number reaches
// display, so it's deliberately strict: only a finite, positive number is
// ever shown. Anything else is treated the same as "not provided," never
// rendered as NaN/Infinity/a negative figure.
function validSalaryNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function formatSalary(job: SalaryFields): string {
  const min = validSalaryNumber(job.salaryMin);
  const max = validSalaryNumber(job.salaryMax);
  const currencyPrefix = job.salaryCurrency ? `${job.salaryCurrency} ` : '';
  const suffix = periodSuffix(job.salaryPeriod);

  if (min && max) return `${currencyPrefix}${min}-${max}${suffix}`;
  if (min) return `${currencyPrefix}From ${min}${suffix}`;
  if (max) return `${currencyPrefix}Up to ${max}${suffix}`;
  return job.salaryRaw || 'Salary not specified by employer';
}
