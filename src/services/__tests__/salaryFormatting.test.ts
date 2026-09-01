import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatSalary } from '../salaryFormatting';

describe('formatSalary', () => {
  test('currency-present: shows the provider-supplied currency prefix on a min-max range', () => {
    assert.equal(formatSalary({ salaryMin: 70000, salaryMax: 90000, salaryCurrency: 'USD' }), 'USD 70000-90000');
  });

  test('currency-present: shows the currency prefix on a min-only figure', () => {
    assert.equal(formatSalary({ salaryMin: 50000, salaryCurrency: 'EUR' }), 'EUR From 50000');
  });

  test('currency-present: shows the currency prefix on a max-only figure', () => {
    assert.equal(formatSalary({ salaryMax: 120000, salaryCurrency: 'GBP' }), 'GBP Up to 120000');
  });

  test('currency-missing: a numeric range renders exactly as before — no invented currency', () => {
    // e.g. Adzuna and Arbeitnow never supply a currency field.
    assert.equal(formatSalary({ salaryMin: 70000, salaryMax: 90000 }), '70000-90000');
  });

  test('currency-missing: min-only figure has no prefix', () => {
    assert.equal(formatSalary({ salaryMin: 50000 }), 'From 50000');
  });

  test('currency-missing but salaryRaw present: raw text is used as-is, untouched', () => {
    assert.equal(formatSalary({ salaryRaw: '$70k - $90k DOE' }), '$70k - $90k DOE');
  });

  test('no salary or currency at all: honest fallback, never fabricated', () => {
    assert.equal(formatSalary({}), 'Salary not specified by employer');
  });

  test('currency alone with no numeric figures and no raw text still falls back honestly', () => {
    assert.equal(formatSalary({ salaryCurrency: 'USD' }), 'Salary not specified by employer');
  });

  describe('7. malformed salary values never produce NaN/Infinity/negative figures in the output', () => {
    test('NaN is ignored, not rendered as "NaN"', () => {
      const result = formatSalary({ salaryMin: NaN, salaryMax: 90000 });
      assert.doesNotMatch(result, /NaN/);
      assert.equal(result, 'Up to 90000');
    });

    test('both values NaN falls back to the honest "not specified" message', () => {
      const result = formatSalary({ salaryMin: NaN, salaryMax: NaN });
      assert.doesNotMatch(result, /NaN/);
      assert.equal(result, 'Salary not specified by employer');
    });

    test('Infinity is ignored, not rendered literally', () => {
      const result = formatSalary({ salaryMin: 50000, salaryMax: Infinity });
      assert.doesNotMatch(result, /Infinity/);
      assert.equal(result, 'From 50000');
    });

    test('a negative figure (a malformed/placeholder value) is ignored', () => {
      const result = formatSalary({ salaryMin: -1, salaryMax: 90000 });
      assert.equal(result, 'Up to 90000');
    });

    test('a zero figure (a common "unspecified" sentinel some APIs use) is ignored, not shown as a real salary', () => {
      const result = formatSalary({ salaryMin: 0, salaryMax: 0 });
      assert.equal(result, 'Salary not specified by employer');
    });

    test('a non-number value that slipped past typing (e.g. a string from a schema drift) is ignored, not concatenated', () => {
      const result = formatSalary({ salaryMin: '50000' as unknown as number, salaryMax: 90000 });
      assert.equal(result, 'Up to 90000');
    });
  });
});
