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

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Fail fast if MongoDB is unreachable
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

// Mongoose Global Event Listeners
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error(`Mongoose connection error: ${err.message}`);
});