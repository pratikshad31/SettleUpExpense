// backend/src/middleware/errorHandler.js
// Centralized error handling middleware

function errorHandler(err, req, res, next) {
  const errorObj = typeof err === 'object' && err !== null ? err : { message: String(err) };
  let statusCode = errorObj.status || errorObj.statusCode || 500;
  if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }
  const isDev = process.env.NODE_ENV === 'development';

  if (statusCode === 500) {
    console.error('Unhandled Server Error:', err);
  }

  // Safe message formatting
  const message = errorObj.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(isDev && errorObj.stack && { stack: errorObj.stack }),
  });
}

module.exports = errorHandler;
