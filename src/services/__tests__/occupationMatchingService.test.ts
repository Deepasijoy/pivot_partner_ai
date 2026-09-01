import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOccupationCompatibility, resolveCandidateDomain } from '../occupationMatchingService';

// Mirrors occupationMatchingService.ts's own internal constants (not
// exported — re-derived here via known input/output pairs from existing
// passing tests above, e.g. test 3's "adjacent" multiplier) so this file
// can assert "a real, uncapped discount strictly between 'adjacent' and
// 'unrelated'" without needing an internal export just for tests.
const ADJACENT_MULTIPLIER = 0.85;
const WEAK_EVIDENCE_MULTIPLIER = 0.6;

describe('classifyOccupationCompatibility', () => {
  test('1. Marine Biologist vs "Data Analyst" -> unrelated, sharply discounted', () => {
    const result = classifyOccupationCompatibility(
      'Marine Biologist',
      ['Marine Science'],
      'Data Analyst',
      'We are looking for a Data Analyst to join our analytics team.'
    );
    assert.equal(result.category, 'unrelated');
    assert.ok(result.multiplier < 0.5);
    assert.ok(result.cap !== undefined && result.cap <= 40);
  });

  test('2. Marine Biologist vs "Marine Biology Researcher" -> same_domain, no adjustment', () => {
    const result = classifyOccupationCompatibility(
      'Marine Biologist',
      ['Marine Science'],
      'Marine Biology Researcher',
      'Conduct marine biology research on coastal ecosystems.'
    );
    assert.equal(result.category, 'same_domain');
    assert.equal(result.multiplier, 1);
  });

  test('3. Marine Biologist vs "Environmental Data Analyst" -> adjacent, moderate discount (not suppressed)', () => {
    const result = classifyOccupationCompatibility(
      'Marine Biologist',
      ['Marine Science'],
      'Environmental Data Analyst',
      'Analyze environmental datasets to support conservation research.'
    );
    assert.equal(result.category, 'adjacent');
    assert.ok(result.multiplier > 0.5 && result.multiplier < 1);
    assert.equal(result.cap, undefined, 'adjacent must not be hard-capped like unrelated');
  });

  test('4. Journalist vs "Content Strategist" -> adjacent', () => {
    const result = classifyOccupationCompatibility(
      'Journalist',
      ['Journalism & Media'],
      'Content Strategist',
      'Own the editorial calendar and content strategy for our brand.'
    );
    assert.equal(result.category, 'adjacent');
  });

  test('5. Journalist vs "Software Engineer" -> unrelated', () => {
    const result = classifyOccupationCompatibility(
      'Journalist',
      ['Journalism & Media'],
      'Software Engineer',
      'Build and maintain our backend services in a modern codebase.'
    );
    assert.equal(result.category, 'unrelated');
  });

  test('6. missing likelyRole and no mappable industry -> unknown, no adjustment, never crashes', () => {
    assert.doesNotThrow(() => {
      const result = classifyOccupationCompatibility(undefined, ['General Business'], 'Data Analyst', 'Analyze data.');
      assert.equal(result.category, 'unknown');
      assert.equal(result.multiplier, 1);
      assert.equal(result.reason, 'candidate_domain_unknown');
    });
  });

  test('missing likelyRole but a mappable industry falls back conservatively to it, rather than staying unknown', () => {
    const result = classifyOccupationCompatibility(undefined, ['Marine Science'], 'Data Analyst', 'Analyze data.');
    assert.equal(result.category, 'unrelated', 'the industry fallback should still gate a genuinely unrelated job');
  });

  test('a job whose title and description give no recognizable domain, and no hint-word overlap with the candidate\'s own domain -> unknown, but a real discount (Step B) — not the same confidence as a same_domain match', () => {
    const result = classifyOccupationCompatibility('Marine Biologist', ['Marine Science'], 'Team Member', 'Join our team.');
    assert.equal(result.category, 'unknown');
    assert.equal(result.reason, 'job_domain_unknown');
    assert.equal(result.multiplier, WEAK_EVIDENCE_MULTIPLIER);
    assert.ok(result.multiplier < ADJACENT_MULTIPLIER, 'must be less confident than a known adjacent transition');
    assert.equal(result.cap, undefined, 'not the same treatment as a confirmed-unrelated job — no hard cap, so a genuinely strong skill match can still surface');
  });

  // -------------------------------------------------------------------
  // Step B regression: informal/modern job titles previously fell into
  // 'unknown' (multiplier 1, no adjustment at all) purely because
  // DOMAIN_FAMILIES's keyword list didn't recognize them — letting them
  // outrank properly-gated jobs. Reproduces the exact titles observed in
  // live QA (Marine Biologist and Marketing profiles).
  // -------------------------------------------------------------------
  describe('Step B — informal/unrecognized job titles no longer get a free pass', () => {
    const informalTitles = ['Senior Independent AI Engineer / Architect', 'Sales Jedi', 'SaaS Product Support Jedi'];

    for (const title of informalTitles) {
      test(`Marine Biologist vs "${title}" -> unknown, discounted below same_domain/adjacent confidence`, () => {
        const result = classifyOccupationCompatibility('Marine Biologist', ['Marine Science'], title, 'Join our growing team.');
        assert.equal(result.category, 'unknown');
        assert.equal(result.multiplier, WEAK_EVIDENCE_MULTIPLIER);
        assert.ok(result.multiplier < ADJACENT_MULTIPLIER);
      });
    }

    test('Marketing professional vs "Head of People" (an HR role with no marketing vocabulary) -> unknown, discounted, not treated as a confident match', () => {
      const result = classifyOccupationCompatibility(
        'Marketing professional',
        ['Marketing'],
        'Head of People',
        'Lead our people operations function as we scale the team.'
      );
      assert.equal(result.category, 'unknown');
      assert.equal(result.multiplier, WEAK_EVIDENCE_MULTIPLIER);
    });

    test('but a differently-worded, genuinely relevant title is rescued as adjacent via hint words, not left in the discounted unknown bucket', () => {
      // "Digital Marketing Sales Executive" matches no DOMAIN_FAMILIES
      // titleKeyword verbatim (the sales_marketing family only lists
      // "sales manager", "marketing manager", etc.) — but it contains the
      // word "sales", one of that family's own hintWords, so it's still
      // recognized as a credible transition instead of falling into the
      // same bucket as "Head of People".
      const result = classifyOccupationCompatibility(
        'Marketing professional',
        ['Marketing'],
        'German-Speaking Digital Marketing Sales Executive',
        'Drive B2B sales for our SaaS platform across the DACH region.'
      );
      assert.equal(result.category, 'adjacent');
      assert.equal(result.multiplier, ADJACENT_MULTIPLIER);
    });
  });

  test('Marine Biologist vs generic "Software Engineer" -> strongly suppressed as unrelated', () => {
    const result = classifyOccupationCompatibility(
      'Marine Biologist',
      ['Marine Science'],
      'Software Engineer',
      'Build and maintain backend services in a modern codebase.'
    );
    assert.equal(result.category, 'unrelated');
    assert.ok(result.cap !== undefined && result.cap <= 30);
  });

  describe('normalization / aliases', () => {
    test('case and whitespace are normalized', () => {
      const result = classifyOccupationCompatibility('  marine BIOLOGIST  ', [], 'MARINE BIOLOGY researcher', '');
      assert.equal(result.category, 'same_domain');
    });

    test('a within-family variant (Data Scientist candidate vs Data Analyst job) is still same_domain', () => {
      const result = classifyOccupationCompatibility('Data Scientist', [], 'Data Analyst', 'Analyze large datasets.');
      assert.equal(result.category, 'same_domain');
    });
  });
});

describe('resolveCandidateDomain', () => {
  test('prefers likelyRole over industries when both are present', () => {
    assert.equal(resolveCandidateDomain('Marine Biologist', ['Finance']), 'marine_environmental_science');
  });

  test('falls back to a mappable industry when likelyRole is absent', () => {
    assert.equal(resolveCandidateDomain(undefined, ['Journalism & Media']), 'journalism_media');
  });

  test('returns null when neither signal maps to a known domain — never invented', () => {
    assert.equal(resolveCandidateDomain(undefined, undefined), null);
    assert.equal(resolveCandidateDomain(undefined, ['General Business']), null);
    assert.equal(resolveCandidateDomain('Museum Curator', ['General Business']), null);
  });
});
