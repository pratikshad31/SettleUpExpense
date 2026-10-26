const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function assertAppRefusesSecret(secret) {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./src/app')"],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, JWT_SECRET: secret },
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  assert.equal(result.error, undefined, 'app boot subprocess should exit without timing out');
  assert.notEqual(result.status, 0, 'app must refuse an invalid JWT secret');
  assert.match(result.stderr, /JWT_SECRET/i);
}

test('app refuses to boot when JWT_SECRET is missing', () => {
  assertAppRefusesSecret('');
});

test('app refuses to boot when JWT_SECRET is shorter than 32 characters', () => {
  assertAppRefusesSecret('x'.repeat(31));
});
