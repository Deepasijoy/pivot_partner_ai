// Text-based geographic matching for destination filtering — deliberately
// not "crude substring matching alone": normalizes case/diacritics/
// punctuation, resolves a small set of common country synonyms, and
// requires a match to land on word/token boundaries (never as a fragment
// embedded inside an unrelated longer word) before falling back to a plain
// contains-check. Not a real geocoder — that's what locationService.ts
// (Nominatim) already is, for the destination side; this only has to
// compare that already-resolved destination against free-text location
// strings the job providers give.
//
// Word-boundary matching closes one class of false positive (a short city
// name matching as a mere fragment of a longer, unrelated word — e.g. a
// destination "Man" must not match inside "Germany"), but it does not and
// cannot resolve genuine place-name collisions between two different real
// places that share a name (e.g. "Paris, France" vs "New Paris, Indiana" —
// "Paris" is a genuine whole word in both). Disambiguating that would
// require an actual geocoded database, which this module deliberately does
// not introduce (see jobAggregatorService.ts's own destination resolution,
// which already uses Nominatim for the user's own destination — providers'
// free-text job-location strings have no equivalent to geocode against).

import { COUNTRIES } from '../../data/countries';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (e.g. München -> Munchen)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Matches `needle` against `haystack` only on word/token boundaries: since
// normalize() always reduces its output to lowercase alphanumerics
// separated by single spaces, a "boundary" is simply the string's own edge
// or an adjacent space — so "man" matches "man" or "isle of man" but not
// "germany" (embedded inside a longer single token), and a multi-word
// needle like "new york" matches "new york city" but not "newyorkshire".
// Both arguments may be raw (unnormalized) text.
function containsWholePhrase(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalize(needle);
  if (!normalizedNeedle) return false;
  return containsWholePhraseNormalized(normalize(haystack), normalizedNeedle);
}

// Same as containsWholePhrase, but for callers that already have both
// sides normalized (avoids re-normalizing the same haystack repeatedly in
// a loop, e.g. findMentionedCountryCodes below).
function containsWholePhraseNormalized(normalizedHaystack: string, normalizedNeedle: string): boolean {
  if (!normalizedNeedle) return false;
  // normalize()'s output only ever contains [a-z0-9] and single spaces, so
  // normalizedNeedle can never contain a regex metacharacter — safe to
  // interpolate directly, no escaping needed.
  const pattern = new RegExp(`(?:^|\\s)${normalizedNeedle}(?:\\s|$)`);
  return pattern.test(normalizedHaystack);
}

// Common country name/abbreviation synonyms — not exhaustive, just enough
// that the most frequent real-world phrasings ("USA", "UK", "UAE") resolve
// to the same key as their full name. A miss here just falls through to a
// plain substring check, it never causes a hard failure.
const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'u s': 'united states',
  'u s a': 'united states',
  america: 'united states',
  uk: 'united kingdom',
  'u k': 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  uae: 'united arab emirates',
};

function normalizeCountryName(value: string): string {
  const base = normalize(value);
  return COUNTRY_SYNONYMS[base] ?? base;
}

const WORLDWIDE_TERMS = ['worldwide', 'anywhere', 'global', 'globally', 'any location', 'all locations', 'international'];

export function textIndicatesWorldwide(text: string): boolean {
  const normalized = normalize(text);
  return WORLDWIDE_TERMS.some((term) => normalized.includes(term));
}

// Small, non-exhaustive region hints — only used as a last resort for
// remote-eligibility free text that names a region rather than a country
// (e.g. Remotive's candidate_required_location: "Europe", "LATAM", "APAC").
// Deliberately coarse and never used for LOCAL/HYBRID city matching; a miss
// here just leaves eligibility "unclear" (see classifyRemoteEligibility
// below), never a wrong hard exclusion.
const REGION_HINTS: Record<string, string[]> = {
  europe: ['gb', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'se', 'ch', 'at', 'ie', 'pt', 'be', 'dk', 'fi', 'no'],
  emea: ['gb', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'se', 'ch', 'at', 'ae', 'za'],
  apac: ['au', 'nz', 'sg', 'in', 'jp', 'cn', 'kr'],
  latam: ['mx', 'br', 'ar', 'cl', 'co'],
  'north america': ['us', 'ca', 'mx'],
};

/**
 * Whether `locationText` (a provider's free-text location/eligibility
 * field) indicates the given destination country. Checked in order: an
 * explicit worldwide/anywhere phrase, the country's own name (word-bounded,
 * synonym-aware), then a region name that's known to include the country
 * code.
 */
export function countryMatchesLocationText(
  countryName: string | undefined,
  countryCode: string | undefined,
  locationText: string
): boolean {
  if (!locationText.trim()) return false;
  if (textIndicatesWorldwide(locationText)) return true;

  const normalizedText = normalize(locationText);

  if (countryName && containsWholePhraseNormalized(normalizedText, normalizeCountryName(countryName))) return true;

  if (countryCode) {
    const lowerCode = countryCode.toLowerCase();
    for (const [region, codes] of Object.entries(REGION_HINTS)) {
      if (containsWholePhraseNormalized(normalizedText, region) && codes.includes(lowerCode)) return true;
    }
  }

  return false;
}

/**
 * Whether `locationText` (a job's own location string) reads as being in
 * the given destination city or region. Word-boundary matched — see the
 * module comment above for exactly what this does and does not guard
 * against.
 */
export function cityOrRegionMatchesLocationText(
  city: string | undefined,
  region: string | undefined,
  locationText: string
): boolean {
  if (!locationText.trim()) return false;

  if (city?.trim() && containsWholePhrase(locationText, city)) return true;
  if (region?.trim() && containsWholePhrase(locationText, region)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Remote-eligibility classification — distinguishes "confirmed", "unclear"
// (no usable signal — retained, never hard-excluded), and "incompatible"
// (explicitly names a different country/region — excluded) instead of the
// old binary match/no-match, so a job with genuinely no eligibility signal
// can be told apart from one that explicitly rules the destination out. See
// jobAggregatorService.ts's filterByDestination, the only caller.
// ---------------------------------------------------------------------------

export type RemoteEligibilityClassification = 'confirmed' | 'unclear' | 'incompatible';

// Every country's own name, plus its common synonyms, mapped to its ISO
// code — used only to recognize when eligibility text names A country
// (any country, not necessarily the destination), so "explicit incompatible
// country" (exclude) can be told apart from "no recognizable place
// mentioned at all" (unclear). Built from the same COUNTRIES list the
// destination country picker already uses (src/data/countries.ts) — this
// is world-country data, not a city database or a country-specific city
// list.
const COUNTRY_NAME_TO_CODE: Array<{ normalizedName: string; code: string }> = (() => {
  const entries = COUNTRIES.map((country) => ({ normalizedName: normalize(country.name), code: country.code }));
  for (const [synonym, canonicalName] of Object.entries(COUNTRY_SYNONYMS)) {
    const canonical = COUNTRIES.find((country) => normalize(country.name) === canonicalName);
    if (canonical) entries.push({ normalizedName: normalize(synonym), code: canonical.code });
  }
  return entries;
})();

function findMentionedCountryCodes(normalizedText: string): Set<string> {
  const codes = new Set<string>();
  for (const entry of COUNTRY_NAME_TO_CODE) {
    if (containsWholePhraseNormalized(normalizedText, entry.normalizedName)) {
      codes.add(entry.code);
    }
  }
  return codes;
}

/**
 * Classifies a job's free-text remote-eligibility signal against the
 * user's resolved destination:
 *  - 'confirmed' — the text names the destination country, states
 *    worldwide/anywhere eligibility, or names a region known to include
 *    the destination.
 *  - 'incompatible' — the text names a specific different country, or a
 *    region that does not include the destination, and does not also
 *    confirm the destination.
 *  - 'unclear' — the text says nothing recognizable either way (or is
 *    empty). Never invented, never treated as either confirmed or
 *    excluded.
 * `locationText` empty/absent always yields 'unclear' — callers with a
 * separate "no eligibility text was provided at all" case can still
 * distinguish that from "text present but uninformative" upstream if they
 * need to; both are 'unclear' here on purpose, since neither one is a
 * reason to exclude the job.
 */
export function classifyRemoteEligibility(
  destinationCountryName: string | undefined,
  destinationCountryCode: string | undefined,
  locationText: string | undefined
): RemoteEligibilityClassification {
  const text = (locationText ?? '').trim();
  if (!text) return 'unclear';

  if (countryMatchesLocationText(destinationCountryName, destinationCountryCode, text)) {
    return 'confirmed';
  }

  const normalizedText = normalize(text);
  const lowerDestCode = destinationCountryCode?.toLowerCase();

  const mentionedCodes = findMentionedCountryCodes(normalizedText);
  const mentionsOtherCountry = lowerDestCode
    ? [...mentionedCodes].some((code) => code !== lowerDestCode)
    : mentionedCodes.size > 0;

  const mentionsIncompatibleRegion = Object.entries(REGION_HINTS).some(([region, codes]) => {
    if (!containsWholePhraseNormalized(normalizedText, region)) return false;
    return !lowerDestCode || !codes.includes(lowerDestCode);
  });

  if (mentionsOtherCountry || mentionsIncompatibleRegion) return 'incompatible';

  return 'unclear';
}
