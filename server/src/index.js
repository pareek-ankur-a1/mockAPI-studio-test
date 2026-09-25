/**
 * @file index.js
 * @description HTTP server entry point.
 *
 * Responsibilities:
 *  1. Load environment variables from .env
 *  2. Connect to MongoDB (fail fast if unavailable)
 *  3. Create the Express app
 *  4. Start listening on the configured port
 *  5. Handle graceful shutdown (SIGTERM / SIGINT)
 *
 * By keeping the DB connection and server startup here (outside app.js),
 * unit tests can import `createApp()` without triggering a real DB connection.
 */

import 'dotenv/config'; // Must be the very first import — populates process.env

import http from 'http';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // Step 1 — Connect to MongoDB before accepting traffic.
    // If MongoDB is down, we intentionally crash here so the process manager
    // (such as PM2 or systemd) can restart us and alert on-call.
    await connectDB();
    const redisClient = await connectRedis();

    // Step 2 — Build the Express application (registers all middleware + routes)
    const app = createApp({ redisClient });

    // Step 3 — Wrap Express in a Node.js HTTP server so we can attach WebSockets
    // later (Phase 4+ live preview) without replacing the server object.
    const server = http.createServer(app);

    // Step 4 — Start listening
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Health check: http://localhost:${PORT}/health`);
    });

    // ── Graceful Shutdown ──────────────────────────────────────────────────
    /**
     * On SIGTERM (sent by the process manager during shutdown) or
     * SIGINT (Ctrl+C in terminal), we:
     *  1. Stop accepting new connections
     *  2. Wait for in-flight requests to finish (server.close callback)
     *  3. Close the MongoDB connection cleanly
     *  4. Exit with code 0 (success)
     *
     * Without this, abrupt process kills can corrupt in-progress Mongoose writes.
     */
    const gracefulShutdown = (signal) => {
      console.log(`\n📴 ${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log('✅ HTTP server closed (no more new connections).');
        try {
          if (redisClient?.isOpen) await redisClient.close();
          await import('mongoose').then((m) => m.default.connection.close());
          console.log('✅ MongoDB connection closed.');
        } catch (err) {
          console.error('Error closing MongoDB connection:', err);
        }
        process.exit(0);
      });

      // Force exit if graceful shutdown takes > 10 seconds
      setTimeout(() => {
        console.error('⏰ Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    // Startup failure (DB unreachable, missing env vars, etc.)
    console.error('💀 Failed to start server:', err.message);
    process.exit(1);
  }
}

bootstrap();
