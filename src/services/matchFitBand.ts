export type MatchFitBand = 'Strong Fit' | 'Worth Exploring' | 'Stretch';

// Single source of truth for score -> displayed band label, used at every
// render site that used to show a raw match percentage (job cards,
// Recommended Paths, Career Paths, Overall Market Fit banner, freelance
// gigs) — so the label can never drift into a different band for the same
// score the way the app's two old scoring formulas once diverged on the
// number itself (see AUDIT.md Q13). A score capped by
// classifyOccupationCompatibility (e.g. clamped to 30) flows through this
// exact same mapping, no special-casing — it lands in "Stretch" simply
// because the capped number is low, same as any other low score.
//
// Display-only: never used for sorting, filtering, or ranking — every
// caller keeps comparing/sorting on the raw numeric score untouched.
export function getMatchFitBand(score: number): MatchFitBand {
  if (score >= 80) return 'Strong Fit';
  if (score >= 55) return 'Worth Exploring';
  return 'Stretch';
}
