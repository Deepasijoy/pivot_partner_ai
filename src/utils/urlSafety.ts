// Validates a URL before it's ever rendered as a clickable external link
// (e.g. JobOpportunity.applyUrl in CareerRecommendations.tsx). Provider
// APIs (Adzuna, Arbeitnow, Remotive, JSearch) are trusted data sources, not
// raw user input, but nothing today stops an unexpected value from being
// inserted verbatim as an href — this is a defense-in-depth allow-list, not
// a sign any provider has actually returned something unsafe.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * True only for a well-formed, absolute http(s) URL. Rejects malformed
 * input, empty/undefined values, and any other scheme — including
 * javascript:, data:, vbscript:, and protocol-relative URLs (e.g.
 * "//example.com", which `new URL()` itself rejects without a base to
 * resolve against).
 */
export function isSafeExternalUrl(url: string | undefined | null): url is string {
  if (!url || !url.trim()) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}
