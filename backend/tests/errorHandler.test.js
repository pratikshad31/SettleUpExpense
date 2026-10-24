// backend/tests/errorHandler.test.js
// Dedicated tests for centralized error handling middleware (src/middleware/errorHandler.js)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const errorHandler = require('../src/middleware/errorHandler');

describe('Centralized Error Handler Middleware (src/middleware/errorHandler.js)', () => {
  function createMockRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  it('should handle custom status errors (e.g. 400 validation error)', () => {
    const err = new Error('Invalid expense total');
    err.status = 400;
    const res = createMockRes();

    errorHandler(err, {}, res, () => {});

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'Invalid expense total');
  });

  it('should default to status 500 when no status is provided', () => {
    const err = new Error('Database connection failed');
    const res = createMockRes();

    errorHandler(err, {}, res, () => {});

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Database connection failed');
  });

  it('should handle string error messages', () => {
    const res = createMockRes();

    errorHandler('Direct string failure', {}, res, () => {});

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Direct string failure');
  });

  it('should clamp invalid status codes to 500', () => {
    const err = { status: 9999, message: 'Weird status' };
    const res = createMockRes();

    errorHandler(err, {}, res, () => {});

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Weird status');
  });
});
