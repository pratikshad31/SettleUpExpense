// backend/src/middleware/errorHandler.js
// Centralized error handling middleware

function errorHandler(err, req, res, next) {
  const errorObj = typeof err === 'object' && err !== null ? err : { message: String(err) };
  let statusCode = errorObj.status || errorObj.statusCode || 500;
  if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }
  const isServerError = statusCode >= 500;
  if (isServerError) {
    console.error('Unhandled Server Error:', err);
  }

  const message = isServerError
    ? 'Internal Server Error'
    : errorObj.message || 'Internal Server Error';

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
