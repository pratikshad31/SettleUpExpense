// backend/app.js
// This file builds the Express app. It does NOT start the server.

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

// Allow the React frontend (different port) to call this API
app.use(cors());

// Lets us read JSON sent in request bodies (req.body)
app.use(express.json());

// Simple check that the server is alive
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Check that the database connection works
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "Database connected successfully!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

// Later phases will plug route files in here, like:
// app.use("/groups", require("./routes/groups"));

module.exports = app;