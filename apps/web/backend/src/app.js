import express from 'express';
import cors from 'cors';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createRateLimiter } from './rateLimit.js';
import { createProvider } from './providers/index.js';
import { createDefaultRegistry } from './tools/serverTools.js';
import { createAuthRouter } from './routes/auth.js';
import { createConversationRouter } from './routes/conversations.js';
import { createSettingsRouter } from './routes/settings.js';
import { createToolsRouter } from './routes/tools.js';

export const API_VERSION = 'v1';

/**
 * Build a LunaAI Web application instance.
 *
 * `overrides` lets tests inject a database, provider or configuration without
 * touching the network or the developer's real data directory.
 */
export function createApp(overrides = {}) {
  const config = deepMerge(loadConfig(), overrides.config || {});
  const db = overrides.db || createDatabase(config.dbPath);
  const provider = overrides.provider || createProvider(config);
  const registry = overrides.registry || createDefaultRegistry();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', overrides.trustProxy ?? false);

  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));

  const globalLimiter = overrides.globalLimiter
    || createRateLimiter({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.globalMax });
  const authLimiter = overrides.authLimiter
    || createRateLimiter({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.authMax,
      keyGenerator: (req) => `${req.ip}|auth`,
    });

  app.use('/api', globalLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      product: 'LunaAI Web',
      apiVersion: API_VERSION,
      provider: provider.id,
      toolsEnabled: config.tools.enabled,
    });
  });

  app.use('/api/auth', createAuthRouter({ db, config, authLimiter }));
  app.use('/api/conversations', createConversationRouter({ db, config, provider, registry }));
  app.use('/api/settings', createSettingsRouter({ db, config }));
  app.use('/api/tools', createToolsRouter({ config, registry }));

  // Unknown /api routes are explicit 404s — never proxies to another product.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    console.error('[lunaai-web] unhandled error:', error?.message || error);
    res.status(500).json({ error: 'internal_error' });
  });

  return { app, config, db, provider, registry };
}

/** Recursive merge for plain configuration objects (arrays and scalars replace). */
export function deepMerge(base, override) {
  if (Array.isArray(override) || override === null || typeof override !== 'object') {
    return override === undefined ? base : override;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = base?.[key];
    const bothPlainObjects = current
      && typeof current === 'object'
      && !Array.isArray(current)
      && value
      && typeof value === 'object'
      && !Array.isArray(value);
    result[key] = bothPlainObjects ? deepMerge(current, value) : value;
  }
  return result;
}
