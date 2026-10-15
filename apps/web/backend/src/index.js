import 'dotenv/config';
import { createApp } from './app.js';

const { app, config } = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[lunaai-web] API listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  if (!process.env.OPENAI_API_KEY) {
    console.log('[lunaai-web] no AI provider key configured — using the development provider');
  }
});

function shutdown(signal) {
  console.log(`[lunaai-web] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
