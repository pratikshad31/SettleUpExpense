// backend/tests/errorHandler.test.js
// Dedicated tests for centralized error handling middleware (src/middleware/errorHandler.js)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
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
    assert.strictEqual(res.body.error, 'Internal Server Error');
    assert.strictEqual(Object.hasOwn(res.body, 'stack'), false);
  });

  it('should handle string error messages', () => {
    const res = createMockRes();

    errorHandler('Direct string failure', {}, res, () => {});

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Internal Server Error');
    assert.strictEqual(Object.hasOwn(res.body, 'stack'), false);
  });

  it('should clamp invalid status codes to 500', () => {
    const err = { status: 9999, message: 'Weird status' };
    const res = createMockRes();

    errorHandler(err, {}, res, () => {});

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Internal Server Error');
    assert.strictEqual(Object.hasOwn(res.body, 'stack'), false);
  });

  it('returns only a generic message for a forced 500, even in development', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const app = express();
    const forcedError = new Error('private server detail');
    forcedError.stack = 'private stack detail';
    app.get('/force-500', (req, res, next) => next(forcedError));
    app.use(errorHandler);

    const originalConsoleError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    try {
      const response = await request(app).get('/force-500');
      assert.strictEqual(response.status, 500);
      assert.deepStrictEqual(response.body, { error: 'Internal Server Error' });
      assert.ok(logged.some((args) => args.includes(forcedError)), 'server error details are logged');
    } finally {
      console.error = originalConsoleError;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
