import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessPortability, assessEorHiring, type PortabilityUser } from '../portabilityService';

const GHANA: PortabilityUser = { countryCode: 'gh', countryName: 'Ghana' };
const UK: PortabilityUser = { countryCode: 'gb', countryName: 'United Kingdom' };

describe('assessPortability — worldwide', () => {
  test('a worldwide field is OPEN, sourced from the field', () => {
    const result = assessPortability({ remoteEligibility: 'Worldwide' }, GHANA);
    assert.equal(result.status, 'open');
    assert.equal(result.source, 'field');
    assert.equal(result.message, 'Open to candidates in Ghana');
  });

  test('"work from anywhere" in the description is OPEN, sourced from the description', () => {
    const result = assessPortability({ description: 'We are fully remote — work from anywhere in the world.' }, GHANA);
    assert.equal(result.status, 'open');
    assert.equal(result.source, 'description');
  });
});

describe('assessPortability — explicit country restriction', () => {
  test('"US only" restricts a Ghana user', () => {
    const result = assessPortability({ remoteEligibility: 'US only' }, GHANA);
    assert.equal(result.status, 'restricted');
    assert.equal(result.source, 'field');
    assert.match(result.message, /Not open to Ghana/);
    assert.ok(result.reason);
  });

  test('"UK residents only" restricts a Ghana user but is OPEN for a UK user', () => {
    const ghanaResult = assessPortability({ description: 'This role is UK residents only.' }, GHANA);
    assert.equal(ghanaResult.status, 'restricted');
    assert.equal(ghanaResult.source, 'description');

    const ukResult = assessPortability({ description: 'This role is UK residents only.' }, UK);
    assert.equal(ukResult.status, 'open');
    assert.equal(ukResult.source, 'description');
  });

  test('"must be located in the United States" restricts a Ghana user', () => {
    const result = assessPortability({ description: 'Candidates must be located in the United States for this role.' }, GHANA);
    assert.equal(result.status, 'restricted');
  });
});

describe('assessPortability — regions', () => {
  test('"EMEA" includes Ghana (Africa is part of EMEA in this map)', () => {
    const result = assessPortability({ remoteEligibility: 'EMEA' }, GHANA);
    assert.equal(result.status, 'open');
    assert.equal(result.source, 'field');
  });

  test('"Africa" is OPEN for a Ghana user', () => {
    const result = assessPortability({ remoteEligibility: 'Africa' }, GHANA);
    assert.equal(result.status, 'open');
  });

  test('"Africa" is RESTRICTED for a UK user (not in the Africa region)', () => {
    const result = assessPortability({ remoteEligibility: 'Africa' }, UK);
    assert.equal(result.status, 'restricted');
  });

  test('"APAC only" restricts both a Ghana user and a UK user', () => {
    const ghanaResult = assessPortability({ remoteEligibility: 'APAC only' }, GHANA);
    assert.equal(ghanaResult.status, 'restricted');
    const ukResult = assessPortability({ remoteEligibility: 'APAC only' }, UK);
    assert.equal(ukResult.status, 'restricted');
  });
});

describe('assessPortability — no usable signal', () => {
  test('empty job fields resolve to unknown, never a guess', () => {
    const result = assessPortability({}, GHANA);
    assert.equal(result.status, 'unknown');
    assert.equal(result.source, undefined);
    assert.equal(result.message, 'Location not stated — check the listing');
  });

  test('a timezone-only mention is unknown, not a location signal', () => {
    const result = assessPortability({ description: 'Must overlap 4 hours with PST during core hours.' }, GHANA);
    assert.equal(result.status, 'unknown');
  });

  test('a generic "full-time only" phrase is not misread as a place restriction', () => {
    const result = assessPortability({ description: 'This is a full-time only position with standard benefits.' }, GHANA);
    assert.equal(result.status, 'unknown');
  });

  test('prose with no recognizable place at all is unknown', () => {
    const result = assessPortability({ description: 'Great team, flexible hours, competitive pay.' }, GHANA);
    assert.equal(result.status, 'unknown');
  });
});

describe('assessPortability — structured field takes priority over description', () => {
  test('a field says Worldwide even though the description looks restrictive', () => {
    const result = assessPortability(
      { remoteEligibility: 'Worldwide', description: 'Preference for US-based candidates but open to all.' },
      GHANA
    );
    assert.equal(result.status, 'open');
    assert.equal(result.source, 'field');
  });

  test('falls back to description when the field text is present but uninformative', () => {
    const result = assessPortability(
      { remoteEligibility: 'Remote', description: 'Open to candidates in Ghana and neighboring countries.' },
      GHANA
    );
    assert.equal(result.status, 'open');
    assert.equal(result.source, 'description');
  });
});

describe('assessPortability — same job, different users', () => {
  test('a UK-only listing is restricted for Ghana and open for the UK', () => {
    const job = { remoteEligibility: 'United Kingdom' };
    assert.equal(assessPortability(job, GHANA).status, 'restricted');
    assert.equal(assessPortability(job, UK).status, 'open');
  });
});

describe('assessEorHiring', () => {
  test('detects an explicit Employer of Record mention', () => {
    assert.equal(assessEorHiring({ description: 'We hire internationally via an Employer of Record.' }).hiresViaEor, true);
  });

  test('detects a named EOR provider', () => {
    assert.equal(assessEorHiring({ description: 'Payroll is handled via Deel for international hires.' }).hiresViaEor, true);
  });

  test('never infers EOR from an unrelated remote/worldwide mention alone', () => {
    assert.equal(assessEorHiring({ remoteEligibility: 'Worldwide', description: 'Fully remote team.' }).hiresViaEor, false);
  });

  test('returns no message when EOR is not mentioned', () => {
    const result = assessEorHiring({ description: 'A normal remote job description.' });
    assert.equal(result.hiresViaEor, false);
    assert.equal(result.message, undefined);
  });
});
