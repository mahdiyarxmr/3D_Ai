import path from 'node:path';

/**
 * LunaAI Web backend configuration.
 *
 * All secrets come from the environment (server-side only). They are never
 * returned to clients and never written to logs.
 */
function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const config = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(env.PORT || 3001),
    host: env.HOST || '0.0.0.0',
    // Comma separated list of allowed browser origins for credentialed requests.
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    dbPath: env.DB_PATH || path.join('data', 'lunaai-web.db'),
    jwtSecret: env.JWT_SECRET || '',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    rateLimit: {
      globalMax: Number(env.RATE_LIMIT_MAX || 300),
      authMax: Number(env.RATE_LIMIT_AUTH_MAX || 20),
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
    },
    provider: {
      name: env.AI_PROVIDER || 'openai',
      apiKey: env.OPENAI_API_KEY || '',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    tools: {
      // Server-side tools are opt-in per deployment and only ever run on the server.
      enabled: bool(env.ENABLE_SERVER_TOOLS, false),
      allowlist: (env.SERVER_TOOL_ALLOWLIST || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      maxRounds: Number(env.SERVER_TOOL_MAX_ROUNDS || 3),
    },
  };

  if (!config.jwtSecret) {
    if (config.isProduction) {
      throw new Error('JWT_SECRET must be set when NODE_ENV=production');
    }
    // Development/test only. Never used when NODE_ENV=production.
    config.jwtSecret = 'dev-only-insecure-secret';
  }

  return config;
}
