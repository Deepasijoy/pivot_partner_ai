import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessRemoteEligibility } from '../remoteEligibilityService';

// Regression coverage for the bracketed/hyphenated country-code-shorthand
// RESTRICTION_PATTERNS added alongside the Arbeitnow work-model fix — the
// real listing that exposed this ("Remote Senior Accountant - Hybrid -
// NL/BE/DE/LU/FR", Valsoft Corp, destination Accra/Ghana) previously fell
// through every existing natural-language pattern and was reported
// 'unclear' ("doesn't state remote eligibility"), even though the title
// plainly states a restriction to five specific countries.

describe('assessRemoteEligibility — bracketed/hyphenated country-code shorthand', () => {
  test('a hyphen-separated "Hybrid - CODE/CODE" title is flagged restricted for a non-matching destination', () => {
    const job = {
      title: 'Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR',
      description: '',
      timezone: '',
    };
    const result = assessRemoteEligibility(job, 'Ghana');
    assert.ok(result);
    assert.equal(result?.status, 'restricted');
    assert.match(result?.message ?? '', /NL\/BE\/DE\/LU\/FR/);
  });

  test('a parenthesized "(Hybrid CODE/CODE)" title is also caught', () => {
    const job = { title: 'Senior Accountant (Hybrid NL/BE/DE/LU/FR)', description: '', timezone: '' };
    const result = assessRemoteEligibility(job, 'Ghana');
    assert.equal(result?.status, 'restricted');
  });

  test('a parenthesized "(CODE/CODE only)" title (no "Hybrid" label) is also caught', () => {
    const job = { title: 'Remote Support Engineer (US/CA only)', description: '', timezone: '' };
    const result = assessRemoteEligibility(job, 'Ghana');
    assert.equal(result?.status, 'restricted');
    assert.match(result?.message ?? '', /US\/CA/);
  });

  test('a destination whose own name literally appears in the title text is still supported, not restricted', () => {
    // The code-list shorthand can't resolve abbreviated codes to country
    // names (known limitation — see arbeitnowProvider.ts's mapArbeitnowJob
    // comment), but a destination named in full elsewhere in the text must
    // still short-circuit to "supported" via the existing whole-text check.
    const job = { title: 'Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR', description: 'Open to candidates in Ghana too.', timezone: '' };
    const result = assessRemoteEligibility(job, 'Ghana');
    assert.equal(result?.status, 'supported');
  });

  test('existing natural-language restriction patterns are unaffected (no regression)', () => {
    const job = { title: 'Remote Data Analyst', description: 'Candidates must be based in the United States for this role.', timezone: '' };
    const result = assessRemoteEligibility(job, 'France');
    assert.equal(result?.status, 'restricted');
    assert.match(result?.message ?? '', /United States/);
  });

  test('a title with neither hybrid/code-list nor natural-language restriction phrasing still yields unclear (no false restriction)', () => {
    const job = { title: 'Remote Data Analyst', description: 'Join our fully distributed team.', timezone: '' };
    const result = assessRemoteEligibility(job, 'Ghana');
    assert.equal(result?.status, 'unclear');
  });
});
