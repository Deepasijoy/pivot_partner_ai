import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalUrl } from '../urlSafety';

describe('isSafeExternalUrl', () => {
  describe('allowed', () => {
    const valid = [
      'https://example.com/jobs/123',
      'http://example.com/jobs/123',
      'https://www.adzuna.com/details/abc123?utm_source=x',
      'https://sub.domain.example.co.uk/path?a=1&b=2',
    ];
    for (const url of valid) {
      test(`accepts ${url}`, () => {
        assert.equal(isSafeExternalUrl(url), true);
      });
    }
  });

  describe('rejected — unsafe schemes', () => {
    const unsafe = [
      'javascript:alert(1)',
      'javascript:void(0)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("hi")',
      'file:///etc/passwd',
    ];
    for (const url of unsafe) {
      test(`rejects ${url}`, () => {
        assert.equal(isSafeExternalUrl(url), false);
      });
    }
  });

  test('rejects a protocol-relative URL', () => {
    assert.equal(isSafeExternalUrl('//evil.example.com/path'), false);
  });

  test('rejects a malformed URL', () => {
    assert.equal(isSafeExternalUrl('not a url at all'), false);
  });

  test('rejects an empty string', () => {
    assert.equal(isSafeExternalUrl(''), false);
  });

  test('rejects whitespace-only', () => {
    assert.equal(isSafeExternalUrl('   '), false);
  });

  test('rejects undefined', () => {
    assert.equal(isSafeExternalUrl(undefined), false);
  });

  test('rejects null', () => {
    assert.equal(isSafeExternalUrl(null), false);
  });
});
