import { COUNTRIES } from '../data/countries';

// Answers a different, more specific question than providers/geoMatch.ts's
// classifyRemoteEligibility: not "should this job even be included in a
// remote search for this destination" (a search-relevance filter, already
// applied upstream in jobAggregatorService.ts), but "can THIS destination's
// resident actually be hired for this specific listing" — PivotPartner's
// core differentiator from a generic job board (see the feat-portability-
// badge task brief). Self-contained on purpose: every keyword list, region
// map, and pattern this needs lives in this one file, not spread across
// geoMatch.ts/remoteEligibilityService.ts, so it's easy to audit and extend
// without touching that older, differently-scoped logic.
//
// Provider reliability (see the Step 1 audit — paste in PR description):
//  - Remotive's candidate_required_location and Himalayas' locationRestrictions
//    are genuine, dedicated structured fields — high confidence, source: 'field'.
//  - Arbeitnow gives no structured field; only title/description text.
//  - Adzuna's NormalizedJob.country is NOT job data — it's the search's own
//    destinationCountry parameter echoed back by adzunaProvider.ts, identical
//    for every result regardless of the actual listing. Never used here.
//  - JSearch's job_country/job_is_remote couldn't be verified live in this
//    environment (no JSEARCH_API_KEY configured) and most plausibly reflect
//    the employer/posting's own location rather than a candidate residency
//    rule — also never used here as a structured signal.
// So in practice "structured field" below means remoteEligibility text
// (Remotive/Himalayas natively, Arbeitnow's reused title text) — every
// provider's raw `description` is the fallback second tier.

export type PortabilityStatus = 'open' | 'restricted' | 'unknown';
export type PortabilitySignalSource = 'field' | 'description';

export interface PortabilityResult {
  status: PortabilityStatus;
  message: string;
  // Present only for 'restricted' — the place the listing says it's
  // limited to, exactly as matched (e.g. "US residents only").
  reason?: string;
  // Present only when status is 'open' or 'restricted' — which text this
  // was decided from, so the UI can say "Based on the job description"
  // versus a provider's own structured eligibility field. Absent for
  // 'unknown', where there's nothing to attribute.
  source?: PortabilitySignalSource;
}

export interface EorResult {
  hiresViaEor: boolean;
  message?: string;
}

// Deliberately narrow — a Pick-style shape, not the full NormalizedJob —
// so a test can construct one with a two-line literal, matching this
// codebase's existing remoteEligibilityService.ts convention.
export interface PortabilityJobInput {
  title?: string;
  description?: string;
  // Remotive's candidate_required_location / Himalayas' locationRestrictions
  // (already converted to text by himalayasProvider.ts) / Arbeitnow's title
  // text (see arbeitnowProvider.ts's own remoteEligibility comment). Absent
  // for Adzuna and JSearch — see the module comment above for why their
  // structured fields are never used here.
  remoteEligibility?: string;
}

export interface PortabilityUser {
  // ISO-3166-1 alpha-2, lowercase.
  countryCode: string;
  countryName: string;
}

// ---------------------------------------------------------------------------
// Region map — country code -> region names it belongs to. Deliberately
// coarse and non-exhaustive (same tolerance as geoMatch.ts's own
// REGION_HINTS): a country missing from a region here just means that
// region-name match won't resolve to OPEN for it — it never causes a false
// RESTRICTED, since restriction detection below requires an explicit
// mismatch, not merely "not found in our map". Easy to extend: add a
// country's code to any continent array it belongs to; the cross-cutting
// job-market regions (emea/apac/latam/americas) are derived from those
// automatically, so one addition updates every region it's part of.
// ---------------------------------------------------------------------------

const CONTINENTS: Record<string, string[]> = {
  africa: [
    'dz', 'ao', 'bj', 'bw', 'bf', 'bi', 'cm', 'cv', 'cf', 'td', 'km', 'cd', 'cg', 'ci', 'dj', 'eg', 'gq', 'er', 'sz',
    'et', 'ga', 'gm', 'gh', 'gn', 'gw', 'ke', 'ls', 'lr', 'ly', 'mg', 'mw', 'ml', 'mr', 'mu', 'ma', 'mz', 'na', 'ne',
    'ng', 'rw', 'st', 'sn', 'sc', 'sl', 'so', 'za', 'ss', 'sd', 'tz', 'tg', 'tn', 'ug', 'zm', 'zw',
  ],
  europe: [
    'al', 'ad', 'at', 'by', 'be', 'ba', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'is', 'ie',
    'it', 'lv', 'li', 'lt', 'lu', 'mt', 'md', 'mc', 'me', 'nl', 'mk', 'no', 'pl', 'pt', 'ro', 'ru', 'sm', 'rs', 'sk',
    'si', 'es', 'se', 'ch', 'ua', 'gb', 'va',
  ],
  asia: [
    'af', 'am', 'az', 'bh', 'bd', 'bt', 'bn', 'kh', 'cn', 'ge', 'in', 'id', 'ir', 'iq', 'il', 'jp', 'jo', 'kz', 'kw',
    'kg', 'la', 'lb', 'my', 'mv', 'mn', 'mm', 'np', 'kp', 'om', 'pk', 'ps', 'ph', 'qa', 'sa', 'sg', 'kr', 'lk', 'sy',
    'tw', 'tj', 'th', 'tl', 'tr', 'tm', 'ae', 'uz', 'vn', 'ye',
  ],
  'north america': ['ca', 'us', 'mx'],
  'central america and caribbean': ['bz', 'cr', 'sv', 'gt', 'hn', 'ni', 'pa', 'cu', 'jm', 'ht', 'do', 'tt', 'bs', 'bb'],
  'south america': ['ar', 'bo', 'br', 'cl', 'co', 'ec', 'gy', 'py', 'pe', 'sr', 'uy', 've'],
  oceania: ['au', 'fj', 'ki', 'mh', 'fm', 'nr', 'nz', 'pw', 'pg', 'ws', 'sb', 'to', 'tv', 'vu'],
};

const MENA_EXTRA = ['dz', 'bh', 'eg', 'iq', 'il', 'jo', 'kw', 'lb', 'ly', 'ma', 'om', 'ps', 'qa', 'sa', 'sy', 'tn', 'ae', 'ye'];

function unique(codes: string[]): string[] {
  return [...new Set(codes)];
}

const REGION_COUNTRIES: Record<string, string[]> = {
  africa: CONTINENTS.africa,
  europe: CONTINENTS.europe,
  asia: CONTINENTS.asia,
  'north america': CONTINENTS['north america'],
  'south america': CONTINENTS['south america'],
  oceania: CONTINENTS.oceania,
  mena: unique(MENA_EXTRA),
  // Cross-cutting job-market groupings actually seen in real remote
  // listings (confirmed live against Remotive's candidate_required_location
  // during the Step 1 audit — "Europe", "LATAM", "APAC", "Americas" are
  // real observed values), built from the continent lists above.
  emea: unique([...CONTINENTS.europe, ...CONTINENTS.africa, ...MENA_EXTRA]),
  apac: unique([...CONTINENTS.asia, ...CONTINENTS.oceania]),
  latam: unique([...CONTINENTS['south america'], ...CONTINENTS['central america and caribbean'], 'mx']),
  americas: unique([...CONTINENTS['north america'], ...CONTINENTS['central america and caribbean'], ...CONTINENTS['south america']]),
};

// Common short forms that appear in real listings but aren't a country's
// canonical name — resolved to the canonical name before matching. Not
// exhaustive; a miss here just falls through to a plain name/region check.
const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  uae: 'united arab emirates',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlaceName(value: string): string {
  const base = normalizeText(value);
  return COUNTRY_SYNONYMS[base] ?? base;
}

// ---------------------------------------------------------------------------
// Worldwide / open-anywhere phrasing.
// ---------------------------------------------------------------------------

const WORLDWIDE_PATTERN =
  /\b(worldwide|work from anywhere|open to (?:candidates|applicants) (?:worldwide|globally|anywhere)|(?:hiring|open|available) (?:in|across) (?:multiple countries|the world|all countries)|no location restrictions?|anywhere in the world|global(?:ly)?)\b/i;

function textIndicatesWorldwide(text: string): boolean {
  return WORLDWIDE_PATTERN.test(text);
}

// ---------------------------------------------------------------------------
// Known-place matching. A generic "capture any word(s) before 'only'" regex
// is a trap here — in a full sentence like "This role is UK residents
// only.", a lazy/greedy capture group has no way to know the place name is
// just "UK" and not "This role is UK" (both satisfy the pattern). The fix:
// only ever match a place name against this fixed allowlist (every country
// name/synonym plus every region key above), via one alternation built
// once at module load — never an open-ended character class. Built from
// normalized (lowercased, diacritic/punctuation-stripped) names, matched
// against text normalized the same way, so no regex-escaping concerns and
// no case sensitivity to worry about.
// ---------------------------------------------------------------------------

const NORMALIZED_PLACE_NAMES: string[] = unique(
  [
    ...COUNTRIES.map((country) => normalizeText(country.name)),
    ...Object.keys(COUNTRY_SYNONYMS).map((synonym) => normalizeText(synonym)),
    ...Object.keys(REGION_COUNTRIES),
  ].filter(Boolean)
  // Longest first, so "united arab emirates" is tried before a shorter
  // name/synonym that might otherwise match a prefix of it first.
).sort((a, b) => b.length - a.length);

// normalizeText's output only ever contains [a-z0-9] and single spaces, so
// none of these names can contain a regex metacharacter — safe to join
// directly. Lookbehind/lookahead boundaries (not consuming groups) so
// adjacent places sharing a single separating space — e.g. Himalayas'
// locationRestrictions joined as "france japan mexico" — are each still
// found by the global scan below, rather than the first match's trailing
// boundary swallowing the space the next place's leading boundary needs.
const PLACE_ALTERNATION = NORMALIZED_PLACE_NAMES.join('|');
const KNOWN_PLACE_PATTERN = new RegExp(`(?<=^|\\s)(${PLACE_ALTERNATION})(?=\\s|$)`, 'g');

// Every recognized place name mentioned anywhere in (already-normalized)
// text, in the order first seen, deduplicated.
function findRecognizedPlaces(normalizedText: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of normalizedText.matchAll(KNOWN_PLACE_PATTERN)) {
    const place = match[1];
    if (!seen.has(place)) {
      seen.add(place);
      found.push(place);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Explicit restriction phrasing — adapted from remoteEligibilityService.ts's
// proven anchored patterns ("must be located in X", "open to residents of
// X"), extended with the "X only" / "X residents only" shapes this task
// specifically asks to catch. Every pattern requires its place to come from
// KNOWN_PLACE_PATTERN above, so a phrase like "full-time only" or "remote
// only" (not a real place) is never mistaken for a location restriction.
// Operates on normalized text (see normalizeText) — an optional "the "
// before the place (as in "must be located in the United States") is
// consumed but not captured, so it doesn't break the exact-name match.
// ---------------------------------------------------------------------------

// Display name for a normalized place (used to build a clean `reason`
// string, e.g. "US residents only" rather than the raw lowercase matched
// text) — countries keep their real name, synonyms resolve to their
// canonical country's name, regions get a short display label.
const REGION_DISPLAY_NAMES: Record<string, string> = {
  emea: 'EMEA',
  apac: 'APAC',
  latam: 'LATAM',
  mena: 'MENA',
  africa: 'Africa',
  europe: 'Europe',
  asia: 'Asia',
  'north america': 'North America',
  'south america': 'South America',
  oceania: 'Oceania',
  americas: 'the Americas',
};

const DISPLAY_NAME_BY_NORMALIZED_PLACE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const country of COUNTRIES) map[normalizeText(country.name)] = country.name;
  for (const [synonym, canonicalNormalized] of Object.entries(COUNTRY_SYNONYMS)) {
    const canonical = COUNTRIES.find((country) => normalizeText(country.name) === canonicalNormalized);
    if (canonical) map[normalizeText(synonym)] = canonical.name;
  }
  for (const [region, label] of Object.entries(REGION_DISPLAY_NAMES)) map[region] = label;
  return map;
})();

function displayName(normalizedPlace: string): string {
  return DISPLAY_NAME_BY_NORMALIZED_PLACE[normalizedPlace] ?? normalizedPlace;
}

const RESTRICTION_PATTERNS: { pattern: RegExp; reason: (place: string) => string }[] = [
  { pattern: new RegExp(`(?:^|\\s)(${PLACE_ALTERNATION})\\s+residents?\\s+only(?=\\s|$)`), reason: (p) => `${displayName(p)} residents only` },
  { pattern: new RegExp(`(?:^|\\s)only\\s+(${PLACE_ALTERNATION})\\s+residents?(?=\\s|$)`), reason: (p) => `${displayName(p)} residents only` },
  { pattern: new RegExp(`(?:^|\\s)(${PLACE_ALTERNATION})\\s+only(?=\\s|$)`), reason: (p) => `${displayName(p)} only` },
  { pattern: new RegExp(`(?:^|\\s)must be (?:based|located|residing|a resident) in (?:the\\s+)?(${PLACE_ALTERNATION})(?=\\s|$)`), reason: (p) => `must be located in ${displayName(p)}` },
  { pattern: new RegExp(`(?:^|\\s)candidates? must (?:be authorized|have the right) to work in (?:the\\s+)?(${PLACE_ALTERNATION})(?=\\s|$)`), reason: (p) => `must be authorized to work in ${displayName(p)}` },
  { pattern: new RegExp(`(?:^|\\s)(?:open|available) to (?:residents|candidates|applicants) (?:of|in|based in) (?:the\\s+)?(${PLACE_ALTERNATION})(?=\\s|$)`), reason: (p) => `open only to candidates in ${displayName(p)}` },
  { pattern: new RegExp(`(?:^|\\s)must reside in (?:the\\s+)?(${PLACE_ALTERNATION})(?=\\s|$)`), reason: (p) => `must reside in ${displayName(p)}` },
];

// ---------------------------------------------------------------------------
// Timezone-only mentions (e.g. "must overlap 4 hours with PST", "EST +/- 3
// hours") are a scheduling constraint, not a country/residency restriction
// — explicitly NOT treated as a location signal in either direction, so a
// listing that only mentions a timezone stays 'unknown' rather than being
// misread as restricted to (or open for) a specific country.
// ---------------------------------------------------------------------------

// Belt-and-suspenders alongside the recognized-place allowlist below (which
// already stops "PST timezone only" from being misread as a restriction to
// a place called "PST timezone" — no such place exists in KNOWN_COUNTRY_NAMES
// or REGION_COUNTRIES) — stripped before the plain country/region substring
// check specifically so a timezone abbreviation can never coincidentally
// look like a country/region name fragment.
const TIMEZONE_ONLY_PATTERN = /\b(?:[a-z]{2,4}\s?[+-]?\d{0,2}\s?(?:timezone|time zone)|pst|est|cst|mst|gmt|utc)\b/i;

// ---------------------------------------------------------------------------
// Employer of Record / international-hiring mentions.
// ---------------------------------------------------------------------------

const EOR_PATTERN =
  /employer of record|\bEOR\b|international(?:ly)? hir(?:e|ing)|hire (?:you |talent |candidates )?(?:globally|worldwide|internationally)|global(?:ly)? hir(?:e|ing)|via (?:deel|remote\.com|oyster(?:\s?hr)?|globalization partners|remofirst|papaya global)/i;

export function detectsEorHiring(text: string): EorResult {
  if (EOR_PATTERN.test(text)) {
    return { hiresViaEor: true, message: 'Hires internationally via EOR' };
  }
  return { hiresViaEor: false };
}

// ---------------------------------------------------------------------------
// Core: does a place mentioned in text include the user, and does a region
// name in text include the user's country?
// ---------------------------------------------------------------------------

// `place` here is always one of NORMALIZED_PLACE_NAMES (either a captured
// regex group from KNOWN_PLACE_PATTERN, already normalized, or run through
// normalizePlaceName defensively) — a country name/synonym or a region key.
function placeMatchesUser(place: string, user: PortabilityUser): boolean {
  const normalized = normalizePlaceName(place);
  if (normalized === normalizePlaceName(user.countryName)) return true;
  const region = REGION_COUNTRIES[normalized];
  if (region) return region.includes(user.countryCode.toLowerCase());
  return false;
}

function findRestriction(normalizedText: string): { place: string; reasonText: string } | undefined {
  for (const { pattern, reason } of RESTRICTION_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) return { place: match[1], reasonText: reason(match[1]) };
  }
  return undefined;
}

// Text that's present but says nothing usable either way — e.g. a
// timezone-only mention. Distinguished from "text absent entirely" only for
// readability; both resolve to 'unknown' from the caller's point of view.
//
// `exhaustiveBareMentions` is the field-vs-description distinction the
// priority order depends on: Remotive's candidate_required_location and
// Himalayas' locationRestrictions-derived text follow a documented
// convention where a bare place name (no "only"/"residents" qualifier —
// e.g. just "USA", or Himalayas' own restriction-list-as-text) means the
// listing IS restricted to that place, not merely that it's mentioned in
// passing. Free-text `description` prose has no such convention — a bare
// mention there ("we have team members across the US and Europe") is not
// reliably a hard restriction, so only an explicit phrase (RESTRICTION_
// PATTERNS) counts for description text.
function evaluateText(
  text: string,
  user: PortabilityUser,
  exhaustiveBareMentions: boolean
): { status: PortabilityStatus; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { status: 'unknown' };

  if (textIndicatesWorldwide(trimmed)) return { status: 'open' };

  const normalizedText = normalizeText(trimmed.replace(TIMEZONE_ONLY_PATTERN, ' '));

  const restriction = findRestriction(normalizedText);
  if (restriction) {
    if (placeMatchesUser(restriction.place, user)) return { status: 'open' };
    return { status: 'restricted', reason: restriction.reasonText };
  }

  const mentionedPlaces = findRecognizedPlaces(normalizedText);
  if (mentionedPlaces.some((place) => placeMatchesUser(place, user))) return { status: 'open' };

  if (exhaustiveBareMentions && mentionedPlaces.length > 0) {
    return { status: 'restricted', reason: mentionedPlaces.map(displayName).join(', ') };
  }

  return { status: 'unknown' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function statusMessage(status: PortabilityStatus, user: PortabilityUser, reason?: string): string {
  if (status === 'open') return `Open to candidates in ${user.countryName}`;
  if (status === 'restricted') return `Not open to ${user.countryName}${reason ? ` — ${reason}` : ''}`;
  return 'Location not stated — check the listing';
}

/**
 * Assesses whether a remote listing is open to a candidate physically
 * located in `user.countryName`. Priority: a provider's own structured
 * `remoteEligibility` field first; the listing's `description` text
 * second (see the module comment for exactly which providers populate
 * which). Never returns 'open' without an explicit worldwide/country/
 * region signal — a listing that says nothing usable resolves to
 * 'unknown', never a guess.
 */
export function assessPortability(job: PortabilityJobInput, user: PortabilityUser): PortabilityResult {
  const fieldText = (job.remoteEligibility ?? '').trim();
  if (fieldText) {
    const evaluated = evaluateText(fieldText, user, true);
    if (evaluated.status !== 'unknown') {
      return { status: evaluated.status, reason: evaluated.reason, source: 'field', message: statusMessage(evaluated.status, user, evaluated.reason) };
    }
  }

  const descriptionText = `${job.title ?? ''} ${job.description ?? ''}`.trim();
  if (descriptionText) {
    const evaluated = evaluateText(descriptionText, user, false);
    if (evaluated.status !== 'unknown') {
      return { status: evaluated.status, reason: evaluated.reason, source: 'description', message: statusMessage(evaluated.status, user, evaluated.reason) };
    }
  }

  return { status: 'unknown', message: statusMessage('unknown', user) };
}

/** Same priority order as assessPortability — field text first, description second. */
export function assessEorHiring(job: PortabilityJobInput): EorResult {
  const fieldText = job.remoteEligibility ?? '';
  const descriptionText = `${job.title ?? ''} ${job.description ?? ''}`;
  return detectsEorHiring(`${fieldText} ${descriptionText}`);
}
