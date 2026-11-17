import 'dotenv/config';
import http from 'http';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDB();
    const redisClient = await connectRedis();

    const app = createApp({ redisClient });

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log('HTTP server closed (no more new connections).');
        try {
          if (redisClient?.isOpen) await redisClient.close();
          await import('mongoose').then((m) => m.default.connection.close());
          console.log('MongoDB connection closed.');
        } catch (err) {
          console.error('Error closing MongoDB connection:', err);
        }
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

bootstrap();