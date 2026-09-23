import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsVisaOrWorkAuthorization, VISA_DISCLAIMER_TEXT } from '../visaDisclaimer';

describe('mentionsVisaOrWorkAuthorization', () => {
  test('matches replies that mention visa, permit, work authorization, or immigration', () => {
    const positives = [
      'You will need a visa to work there.',
      'Local roles require a work permit.',
      'This depends on your work authorization status.',
      'Check with the immigration authority first.',
      'Permits vary by employer.',
    ];
    for (const text of positives) {
      assert.equal(mentionsVisaOrWorkAuthorization(text), true, `expected a match for: "${text}"`);
    }
  });

  test('does not match replies with no visa/work-authorization content', () => {
    const negatives = [
      '',
      'Remote work is a great fit for your background.',
      'Consider brushing up on Power BI and SQL.',
      'Local salaries in Accra tend to be lower than remote pay.',
    ];
    for (const text of negatives) {
      assert.equal(mentionsVisaOrWorkAuthorization(text), false, `expected no match for: "${text}"`);
    }
  });

  test('is case-insensitive', () => {
    assert.equal(mentionsVisaOrWorkAuthorization('VISA requirements apply.'), true);
  });

  test('the disclaimer text is the exact fixed copy requested', () => {
    assert.equal(
      VISA_DISCLAIMER_TEXT,
      'Work-permit rules depend on your situation — check the official immigration service.'
    );
  });
});
