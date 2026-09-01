// Resolves a user's free-text relocation destination (any city, region, or
// country, worldwide) into structured location data — without a hand-built
// city/country mapping table. Uses OpenStreetMap Nominatim, a free public
// geocoding service, as the resolution provider. The provider call is
// isolated behind resolveDestination() so it can be swapped later (e.g. for
// a paid/rate-limit-friendly geocoder behind a server proxy) without
// touching any caller.
//
// Nominatim's usage policy asks for a descriptive User-Agent header, which
// browser fetch() cannot set (it's a forbidden header name) — acceptable for
// light MVP usage against the public endpoint, but this should move behind
// a server-side proxy before high-volume production traffic.

export type LocationConfidence = 'high' | 'medium' | 'ambiguous' | 'none';

export interface LocationCandidate {
  label: string;
  city?: string;
  region?: string;
  countryName: string;
  countryCode: string; // ISO-3166-1 alpha-2, lowercase
  // Nominatim's own real-world-prominence score (0-1) for this candidate —
  // used only to tell a globally-dominant place apart from a small
  // same-named locality elsewhere; never a hand-built city ranking.
  importance: number;
}

export interface ResolvedLocation {
  originalInput: string;
  // "Remote" is a work-location preference, not a place — never geocoded.
  isRemote: boolean;
  city?: string;
  region?: string;
  countryName?: string;
  countryCode?: string; // ISO-3166-1 alpha-2, lowercase (Adzuna's convention)
  confidence: LocationConfidence;
  // Populated only when confidence === 'ambiguous': multiple candidates
  // that disagree on country. Callers must not silently pick one.
  candidates?: LocationCandidate[];
  // Populated when resolution failed outright (empty input, network error,
  // no matches, or a match with no usable country data).
  error?: string;
}

const REMOTE_PATTERN = /^(remote|fully\s*remote|remote\s*work|anywhere|work\s*from\s*anywhere)$/i;

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  display_name: string;
  address?: NominatimAddress;
  importance?: number;
}

async function queryNominatim(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
    // Requests English place names regardless of the destination's own
    // locale, so results are consistent for this app's English UI (without
    // this, Nominatim can return a country's name in its local language —
    // e.g. Arabic for the UAE — with no per-destination special-casing).
    'accept-language': 'en',
  });

  const response = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Location lookup failed (${response.status})`);
  }

  return response.json();
}

function toCandidate(result: NominatimResult): LocationCandidate | null {
  const address = result.address;
  const countryCode = address?.country_code?.toLowerCase();
  if (!address || !countryCode) return null;

  return {
    label: result.display_name,
    city: address.city || address.town || address.village || address.county,
    region: address.state || address.region,
    countryName: address.country || result.display_name,
    countryCode,
    importance: result.importance ?? 0,
  };
}

// Conservative thresholds for auto-resolving an otherwise-ambiguous
// destination, derived from real Nominatim data for known cross-country
// name collisions (London/Toronto/Sydney/Dublin vs small same-named
// localities elsewhere): the true global city consistently scored at least
// ~0.24 higher in importance than the next-best candidate from a different
// country, and always scored above 0.75 itself. Both thresholds are kept
// well clear of those observed margins so only a genuinely lopsided case
// auto-resolves — anything closer still falls through to the existing
// ambiguous handling below.
const MIN_TOP_IMPORTANCE = 0.5;
const IMPORTANCE_MARGIN = 0.15;

/**
 * Resolves free-text destination input (a city, a region, a country, or the
 * literal word "remote") into a structured location. Never guesses across
 * genuinely ambiguous results — callers get `confidence: 'ambiguous'` plus
 * the candidate list instead, and must decide how to resolve it (e.g. ask
 * the user), rather than this function silently picking one.
 */
export async function resolveDestination(rawInput: string): Promise<ResolvedLocation> {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return {
      originalInput: rawInput,
      isRemote: false,
      confidence: 'none',
      error: 'No destination provided.',
    };
  }

  if (REMOTE_PATTERN.test(trimmed)) {
    return { originalInput: rawInput, isRemote: true, confidence: 'high' };
  }

  let results: NominatimResult[];
  try {
    results = await queryNominatim(trimmed);
  } catch (err) {
    return {
      originalInput: rawInput,
      isRemote: false,
      confidence: 'none',
      error: err instanceof Error ? err.message : 'Location lookup failed.',
    };
  }

  if (!results || results.length === 0) {
    return {
      originalInput: rawInput,
      isRemote: false,
      confidence: 'none',
      error: `Could not resolve "${trimmed}" to a location.`,
    };
  }

  const candidates = results
    .map(toCandidate)
    .filter((candidate): candidate is LocationCandidate => candidate !== null);

  if (candidates.length === 0) {
    return {
      originalInput: rawInput,
      isRemote: false,
      confidence: 'none',
      error: `"${trimmed}" did not resolve to a recognizable country.`,
    };
  }

  const distinctCountryCodes = new Set(candidates.map((candidate) => candidate.countryCode));

  if (distinctCountryCodes.size > 1) {
    // Top matches disagree on country. Before giving up, check whether one
    // candidate is so much more prominent (by Nominatim's own importance
    // score) than every candidate from a different country that guessing
    // it is actually safe — e.g. "London" globally means London, UK, not
    // the much smaller London, Ontario, even though both are valid matches.
    // This is general (uses Nominatim's existing relevance signal, not a
    // list of specific city names) and conservative (falls through to the
    // existing ambiguous behavior unless the gap clearly favors one place).
    const byImportance = [...candidates].sort((a, b) => b.importance - a.importance);
    const top = byImportance[0];
    const bestOtherCountry = byImportance.find((candidate) => candidate.countryCode !== top.countryCode);

    if (
      bestOtherCountry &&
      top.importance >= MIN_TOP_IMPORTANCE &&
      top.importance - bestOtherCountry.importance >= IMPORTANCE_MARGIN
    ) {
      return {
        originalInput: rawInput,
        isRemote: false,
        city: top.city,
        region: top.region,
        countryName: top.countryName,
        countryCode: top.countryCode,
        confidence: 'high',
      };
    }

    // No candidate is clearly dominant — genuinely ambiguous. Surface the
    // candidates instead of guessing.
    return {
      originalInput: rawInput,
      isRemote: false,
      confidence: 'ambiguous',
      candidates: candidates.slice(0, 5),
    };
  }

  const top = candidates[0];
  return {
    originalInput: rawInput,
    isRemote: false,
    city: top.city,
    region: top.region,
    countryName: top.countryName,
    countryCode: top.countryCode,
    confidence: results.length === 1 ? 'high' : 'medium',
  };
}

// ---------------------------------------------------------------------------
// Explicit-destination resolution — PivotPartner's destination model is
// global and is never limited by any one job-search provider's coverage
// (provider-specific support, e.g. Adzuna's country list, lives entirely
// inside that provider's own adapter — see providers/adzunaProvider.ts —
// and must never reject or gate what a user can select here).
//
// Unlike resolveDestination() above, the country is never guessed from
// free text: the caller (Career & Income's destination fields) already
// requires the user to explicitly choose a country (e.g. from
// src/data/countries.ts) and separately type a city/region. Nominatim is
// used only to validate/enrich that city text against the country already
// chosen — deriving a region where possible — never to determine the
// country itself, and never to override what the user selected.
// ---------------------------------------------------------------------------

export interface DestinationInput {
  // ISO-3166-1 alpha-2, lowercase — from the user's explicit country
  // selection (src/data/countries.ts), not inferred from geocoding.
  countryCode: string;
  // Display name paired with countryCode, from that same selection —
  // passed through as-is rather than re-derived from a Nominatim result,
  // so it always matches exactly what the user picked.
  countryName: string;
  // Free text the user typed for the city/region within that country.
  // May be empty for a country-only (region-wide) destination.
  cityOrRegion: string;
}

export async function resolveDestinationFromParts(input: DestinationInput): Promise<ResolvedLocation> {
  const countryCode = input.countryCode.trim().toLowerCase();
  const countryName = input.countryName.trim();
  const cityOrRegion = input.cityOrRegion.trim();

  if (!countryCode || !countryName) {
    return {
      originalInput: cityOrRegion,
      isRemote: false,
      confidence: 'none',
      error: 'No destination country was provided.',
    };
  }

  if (!cityOrRegion) {
    // Country-only destination — valid on its own (a nationwide search),
    // nothing to validate/enrich via Nominatim without a city to look up.
    return {
      originalInput: '',
      isRemote: false,
      countryName,
      countryCode,
      confidence: 'high',
    };
  }

  let results: NominatimResult[];
  try {
    results = await queryNominatim(`${cityOrRegion}, ${countryName}`);
  } catch {
    // Validation/enrichment failed (network error, etc.) — the user's
    // explicit country + typed city are still a valid destination on
    // their own; just without a derived region.
    return {
      originalInput: cityOrRegion,
      isRemote: false,
      city: cityOrRegion,
      countryName,
      countryCode,
      confidence: 'medium',
    };
  }

  const candidates = (results ?? [])
    .map(toCandidate)
    .filter((candidate): candidate is LocationCandidate => candidate !== null);

  // Only a candidate whose OWN country matches the user's explicit
  // selection can enrich the result — a same-named place elsewhere must
  // never silently override the country the user chose.
  const matching = candidates.find((candidate) => candidate.countryCode === countryCode);

  if (matching) {
    return {
      originalInput: cityOrRegion,
      isRemote: false,
      city: matching.city || cityOrRegion,
      region: matching.region,
      countryName,
      countryCode,
      confidence: 'high',
    };
  }

  // Nominatim didn't confirm this city within the selected country (typo,
  // a very small place it doesn't index, etc.) — keep the user's own
  // country + typed city rather than rejecting the destination; just at
  // lower confidence, with no derived region.
  return {
    originalInput: cityOrRegion,
    isRemote: false,
    city: cityOrRegion,
    countryName,
    countryCode,
    confidence: 'medium',
  };
}
