import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cityOrRegionMatchesLocationText, classifyRemoteEligibility } from '../geoMatch';

describe('cityOrRegionMatchesLocationText — word-boundary city/region matching', () => {
  test('1. Local Montpellier matches a Montpellier listing', () => {
    assert.equal(cityOrRegionMatchesLocationText('Montpellier', undefined, 'Montpellier, France'), true);
  });

  test('2. Local Montpellier does not match a Paris listing', () => {
    assert.equal(cityOrRegionMatchesLocationText('Montpellier', undefined, 'Paris, France'), false);
  });

  describe('3. multi-word destination cities match their own full phrase', () => {
    const cases: Array<[city: string, locationText: string]> = [
      ['New York', 'New York, NY, USA'],
      ['Hong Kong', 'Hong Kong SAR'],
      ['Mexico City', 'Mexico City, Mexico'],
      ['Abu Dhabi', 'Abu Dhabi, United Arab Emirates'],
      ['Sao Paulo', 'Sao Paulo, Brazil'],
    ];
    for (const [city, locationText] of cases) {
      test(`"${city}" matches "${locationText}"`, () => {
        assert.equal(cityOrRegionMatchesLocationText(city, undefined, locationText), true);
      });
    }

    test('a multi-word city does not match on a partial word overlap alone (New York vs New Delhi)', () => {
      assert.equal(cityOrRegionMatchesLocationText('New York', undefined, 'New Delhi, India'), false);
    });
  });

  describe('4. diacritics normalize correctly both directions', () => {
    test('accented destination matches an unaccented listing', () => {
      assert.equal(cityOrRegionMatchesLocationText('Montréal', undefined, 'Montreal, QC, Canada'), true);
    });

    test('unaccented destination matches an accented listing', () => {
      assert.equal(cityOrRegionMatchesLocationText('Sao Paulo', undefined, 'São Paulo, Brazil'), true);
    });

    test('accented destination matches an accented listing', () => {
      assert.equal(cityOrRegionMatchesLocationText('São Paulo', undefined, 'São Paulo, Brazil'), true);
    });
  });

  test('5. a city name embedded inside a longer unrelated word is rejected (Nice vs Venice)', () => {
    assert.equal(cityOrRegionMatchesLocationText('Nice', undefined, 'Venice, Italy'), false);
    // sanity check — Nice still matches its own genuine listing.
    assert.equal(cityOrRegionMatchesLocationText('Nice', undefined, 'Nice, France'), true);
  });

  test('the known, undisambiguated residual case is documented, not silently "fixed" by guessing', () => {
    // "New Paris, Indiana" genuinely contains "Paris" as its own whole
    // word — word-boundary matching alone cannot tell this apart from
    // Paris, France without a real geocoded database, which this module
    // deliberately does not add (see geoMatch.ts's own module comment).
    assert.equal(cityOrRegionMatchesLocationText('Paris', undefined, 'New Paris, Indiana, USA'), true);
  });

  test('region matching also uses word boundaries, not raw substring inclusion', () => {
    // "Man" embedded as a fragment inside "Germany" must not match; "Man"
    // as its own word (e.g. Isle of Man) must.
    assert.equal(cityOrRegionMatchesLocationText(undefined, 'Man', 'Remote, Germany'), false);
    assert.equal(cityOrRegionMatchesLocationText(undefined, 'Man', 'Douglas, Isle of Man'), true);
  });
});

describe('classifyRemoteEligibility', () => {
  test('6. explicit destination-country match -> confirmed', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'Open to candidates in France'), 'confirmed');
  });

  test('7. explicit worldwide eligibility -> confirmed', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'Worldwide'), 'confirmed');
  });

  test('8. explicit incompatible country -> incompatible (excluded upstream)', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'United States only'), 'incompatible');
  });

  test('9. no eligibility text at all -> unclear, never invented as confirmed or excluded', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', undefined), 'unclear');
    assert.equal(classifyRemoteEligibility('France', 'fr', ''), 'unclear');
    assert.equal(classifyRemoteEligibility('France', 'fr', '   '), 'unclear');
  });

  test('text present but uninformative (names no recognizable place) -> unclear, not incompatible', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'Remote'), 'unclear');
  });

  test('a compatible region containing the destination -> confirmed', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'Europe'), 'confirmed');
  });

  test('an incompatible region not containing the destination -> incompatible', () => {
    assert.equal(classifyRemoteEligibility('France', 'fr', 'LATAM only'), 'incompatible');
  });

  test('never confirms merely because the text says "remote" (no destination-specific signal)', () => {
    assert.equal(classifyRemoteEligibility('Japan', 'jp', 'Fully remote position'), 'unclear');
  });
});
