// backend/src/controllers/authController.js
// Authentication and user profile controller

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { isValidUpiId } = require('../utils/upi');
const { validatePassword } = require('../utils/password');
const { JWT_SECRET } = require('../config');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('SettleUpExpense dummy login password', 10);

/**
 * Sign up a new user
 */
async function signup(req, res, next) {
  try {
    const { name, email, password, upi_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    if (upi_id && upi_id.trim() && !isValidUpiId(upi_id.trim())) {
      return res.status(400).json({ error: 'Invalid UPI ID format (e.g. name@bank or phone@upi)' });
    }

    // Check if email already taken
    const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email address already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO users (name, email, password_hash, upi_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, upi_id, created_at`,
      [name.trim(), cleanEmail, passwordHash, upi_id ? upi_id.trim() : null]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'Account created successfully',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Login user with email and password
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, upi_id, created_at FROM users WHERE email = $1',
      [cleanEmail]
    );

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !isMatch) {
      return res.status(401).json({ error: 'Invalid email or password. Please try again.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Exclude password_hash from response
    delete user.password_hash;

    res.json({
      message: 'Logged in successfully',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get currently authenticated user profile
 */
async function me(req, res) {
  res.json({ user: req.user });
}

/**
 * Update authenticated user profile
 */
async function updateProfile(req, res, next) {
  try {
    const { name, upi_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    if (upi_id && upi_id.trim() && !isValidUpiId(upi_id.trim())) {
      return res.status(400).json({ error: 'Invalid UPI ID format (e.g. name@bank)' });
    }

    const result = await query(
      `UPDATE users 
       SET name = $1, upi_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, email, upi_id, created_at, updated_at`,
      [name.trim(), upi_id && upi_id.trim() ? upi_id.trim() : null, req.user.id]
    );

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Change password
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  me,
  updateProfile,
  changePassword,
};
