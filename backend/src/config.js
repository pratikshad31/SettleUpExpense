const jwtSecret = process.env.JWT_SECRET;

if (typeof jwtSecret !== 'string' || jwtSecret.trim().length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

module.exports = Object.freeze({ JWT_SECRET: jwtSecret });
