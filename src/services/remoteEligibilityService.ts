import type { JobOpportunity } from '../types';

// Heuristically assesses what a live listing's own title/description text
// actually says about remote-work geographic eligibility for the user's
// destination. Called unconditionally by CareerRecommendations.tsx for
// every live 'remote'-kind card regardless of which provider it came from
// (Adzuna, Arbeitnow, Remotive, JSearch, Himalayas) — none of these give a
// fully structured eligibility field of their own (Remotive/Himalayas give
// a free-text/array signal handled separately by geoMatch.ts's
// classifyRemoteEligibility; Adzuna and Arbeitnow give none at all), so
// this is necessarily best-effort text matching over real listing content
// — never a database of employer policies, and never a guess when the
// listing is silent. When the listing gives no explicit signal either way,
// the result is 'unclear', not 'supported' or 'restricted' — this function
// must never assert eligibility (or an EOR route) that the listing didn't
// actually say.

export type RemoteEligibilityStatus = 'supported' | 'restricted' | 'eor_mentioned' | 'unclear';

export interface RemoteEligibility {
  status: RemoteEligibilityStatus;
  message: string;
}

const EOR_PATTERN =
  /employer of record|\bEOR\b|international(?:ly)? hir(?:e|ing)|hire (?:you |talent |candidates )?(?:globally|worldwide|internationally)|global(?:ly)? hir(?:e|ing)|via (?:deel|remote\.com|oyster(?:\s?hr)?|globalization partners|remofirst|papaya global)/i;

const WORLDWIDE_PATTERN =
  /work from anywhere|remote[\s-]*(?:,)?\s*(?:worldwide|global|anywhere)|open to (?:candidates|applicants) (?:worldwide|globally|anywhere)|(?:hiring|open) (?:in|across) (?:multiple countries|the world|all countries)|no location restrictions?/i;

// Each pattern captures the location phrase the listing says is required.
// The capture is bounded not just by punctuation but by common sentence
// continuations (" for this role", " without sponsorship", " only", etc.) —
// without that, a lazy match still runs to the next punctuation mark and
// can sweep up trailing words that aren't part of the location name.
const LOCATION_STOP = '(?:[.,;]|\\s+(?:for|and|without|who|which|role|position|at|only|residents?|candidates?)\\b|$)';

// A slash-separated list of 2+ letter codes, e.g. "NL/BE/DE/LU/FR" or
// "US/CA" — the shorthand Arbeitnow titles use in place of natural-
// language phrasing (see arbeitnowProvider.ts's mapArbeitnowJob comment).
// Each token is bounded to letters only, so it can never overrun into an
// unrelated trailing word.
const COUNTRY_CODE_LIST = '[A-Za-z]{2,3}(?:\\s*\\/\\s*[A-Za-z]{2,3})+';

const RESTRICTION_PATTERNS: RegExp[] = [
  new RegExp(`must be (?:based|located|residing|a resident) in ([A-Za-z '-]+?)${LOCATION_STOP}`, 'i'),
  new RegExp(`candidates? must (?:be authorized|have the right) to work in ([A-Za-z '-]+?)${LOCATION_STOP}`, 'i'),
  new RegExp(`(?:only )?(?:open|available) to (?:residents|candidates|applicants) (?:of|in|based in) ([A-Za-z '-]+?)${LOCATION_STOP}`, 'i'),
  new RegExp(`must reside in ([A-Za-z '-]+?)${LOCATION_STOP}`, 'i'),
  // Bracketed/hyphenated country-code shorthand, e.g. "(Hybrid NL/BE/DE/LU/FR)"
  // or "(US/CA only)" — with or without a leading "Hybrid" label, inside
  // parens.
  new RegExp(`\\((?:hybrid\\s+)?(${COUNTRY_CODE_LIST})(?:\\s+only)?\\)`, 'i'),
  // Same shorthand introduced by "Hybrid" with a hyphen/colon separator
  // instead of parens, e.g. "Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR".
  new RegExp(`hybrid\\s*[-:]\\s*(${COUNTRY_CODE_LIST})`, 'i'),
];

function textMentionsCountry(text: string, countryName: string): boolean {
  return text.toLowerCase().includes(countryName.toLowerCase());
}

/**
 * `job` should be a genuinely live listing from any provider (never a
 * mock/example job — callers must gate on jobSource === 'live' before
 * calling this). `destinationCountryName` is the user's resolved
 * relocation destination.
 * Returns null when there isn't enough to go on to say anything at all
 * (no destination known, or the listing text is empty) — no UI should be
 * shown in that case rather than guessing.
 */
export function assessRemoteEligibility(
  job: Pick<JobOpportunity, 'title' | 'description' | 'timezone'>,
  destinationCountryName?: string
): RemoteEligibility | null {
  const text = `${job.title} ${job.description} ${job.timezone}`.trim();
  if (!text) return null;

  const hasDestination = Boolean(destinationCountryName && destinationCountryName.trim());
  const mentionsEor = EOR_PATTERN.test(text);

  // Check an explicit geographic restriction FIRST, before the generic EOR
  // mention below — a listing that both says "must be based in the US" and
  // "we hire internationally" (e.g. about other roles, or in boilerplate
  // company copy) is still restricted for THIS role; the specific
  // restriction is the more important, more actionable fact, and its own
  // message already includes the EOR-ask suggestion, so nothing is lost by
  // checking it first.
  if (hasDestination) {
    if (WORLDWIDE_PATTERN.test(text)) {
      return { status: 'supported', message: '' };
    }

    for (const pattern of RESTRICTION_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const requiredLocation = match[1].trim();
        if (
          textMentionsCountry(requiredLocation, destinationCountryName as string) ||
          textMentionsCountry(destinationCountryName as string, requiredLocation)
        ) {
          return { status: 'supported', message: '' };
        }
        const eorNote = mentionsEor
          ? ' This listing does also mention international/Employer of Record hiring, so it may still be worth asking.'
          : '';
        return {
          status: 'restricted',
          message: `⚠️ Remote eligibility may be restricted — this listing appears to require candidates based in ${requiredLocation}. Ask the employer whether they can hire in your destination through an Employer of Record (EOR).${eorNote}`,
        };
      }
    }
  }

  // No explicit restriction found (or conflict to check against) — a
  // standalone EOR/international-hiring mention is a genuine positive
  // signal on its own, regardless of whether a destination is known.
  if (mentionsEor) {
    return {
      status: 'eor_mentioned',
      message: 'EOR hiring may be available — this listing mentions international/Employer of Record hiring.',
    };
  }

  // Everything below compares the listing's stated location against the
  // user's destination, so it needs a destination to compare against —
  // without one, stay silent rather than guessing.
  if (!hasDestination) return null;

  if (textMentionsCountry(text, destinationCountryName as string)) {
    return { status: 'supported', message: '' };
  }

  return {
    status: 'unclear',
    message:
      "This listing doesn't state remote eligibility for your destination. Ask the employer whether they can hire in your destination through an Employer of Record (EOR).",
  };
}
