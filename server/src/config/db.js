/**
 * @file db.js
 * @description MongoDB connection module using Mongoose.
 *
 * Centralises all connection logic so `index.js` stays clean.
 * Returns a promise that resolves once the connection is established,
 * which lets the Express server start only after the DB is ready.
 *
 * Connection events are logged so issues are immediately visible in
 * the terminal during development and in production log aggregators.
 */

import mongoose from 'mongoose';

/**
 * Establishes a Mongoose connection to MongoDB.
 *
 * @returns {Promise<void>} Resolves when connected, rejects on failure.
 */
export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    // Fail fast: missing URI is a misconfiguration, not a runtime error.
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  try {
    const conn = await mongoose.connect(uri, {
      // These options suppress deprecation warnings in Mongoose 7/8:
      // (kept explicit for clarity — Mongoose 8 sets these as defaults)
      serverSelectionTimeoutMS: 5000, // Fail fast if MongoDB is unreachable
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    // Re-throw so the caller (index.js) can decide whether to exit
    throw err;
  }
}

// ─── Mongoose Global Event Listeners ────────────────────────────────────────
// Log disconnection events so ops teams can spot flapping connections in logs.

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error(`🔥 Mongoose connection error: ${err.message}`);
});
