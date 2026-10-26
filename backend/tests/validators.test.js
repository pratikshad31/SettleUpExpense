const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_AMOUNT_PAISE, parsePaise } = require('../src/utils/validators');

describe('Paise input validation', () => {
  it('accepts the configured maximum amount', () => {
    assert.equal(MAX_AMOUNT_PAISE, 1000000000);
    assert.equal(parsePaise(MAX_AMOUNT_PAISE, 'amountPaise'), MAX_AMOUNT_PAISE);
  });

  it('rejects invalid values with a 400-style field error', () => {
    const invalidValues = [
      100.5,
      1e23,
      9007199254740992,
      MAX_AMOUNT_PAISE + 1,
      -5,
      0,
      'abc',
      null,
      '',
      [],
      {},
    ];

    for (const value of invalidValues) {
      assert.throws(
        () => parsePaise(value, 'amountPaise'),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /^amountPaise: .+ Expected .+\.$/);
          return true;
        },
        `expected ${JSON.stringify(value)} to be rejected`
      );
    }
  });
});
