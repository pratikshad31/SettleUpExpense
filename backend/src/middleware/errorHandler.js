// backend/src/middleware/errorHandler.js
// Centralized error handling middleware

function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  if (statusCode === 500) {
    console.error('Unhandled Server Error:', err);
  }

  // Safe message formatting
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
