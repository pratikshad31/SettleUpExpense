// Test-only environment defaults. Runtime config must never provide a secret fallback.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'settleup-test-only-jwt-secret-longer-than-32-chars';
}
