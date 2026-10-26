// backend/src/app.js
// Express application configuration and route mounting

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { pool, query } = require('./db');
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
app.set('trust proxy', 1);

// Security and utility middleware
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (allowedOrigins.has('*')) {
  throw new Error('CORS_ORIGINS must contain explicit origins; wildcard is not allowed.');
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};

  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  function containsNullByte(value) {
    if (typeof value === 'string') return value.includes('\0');
    if (Array.isArray(value)) return value.some(containsNullByte);
    if (value && typeof value === 'object') {
      return Object.entries(value).some(([key, nestedValue]) => key.includes('\0') || containsNullByte(nestedValue));
    }
    return false;
  }

  if (containsNullByte(req.body)) {
    return res.status(400).json({ error: 'Request body must not contain null bytes' });
  }

  next();
});
app.use(generalLimiter);

// Health check endpoints
app.get('/', (req, res) => {
  res.json({
    app: 'SettleUpExpenses API',
    status: 'online',
    version: '1.0.0',
    documentation: '/docs',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/db-test', async (req, res, next) => {
  try {
    const result = await query('SELECT NOW() as current_time, current_database() as database');
    res.json({
      message: 'PostgreSQL database connected successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/users', userRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
