// backend/src/app.js
// Express application configuration and route mounting

const express = require('express');
const cors = require('cors');
const { pool, query } = require('./db');
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Security and utility middleware
app.use(cors());
app.use(express.json());
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
