import { Router } from 'express';
import { requireAuth } from '../auth.js';

/**
 * Read-only view of the server-side tool catalog.
 *
 * This endpoint exists so operators and clients can see exactly which
 * server-scoped tools a deployment exposes. It never executes anything and it
 * can never expose a local-computer capability, because none can be registered.
 */
export function createToolsRouter({ config, registry }) {
  const router = Router();
  router.use(requireAuth({ secret: config.jwtSecret }));

  router.get('/', (_req, res) => {
    res.json({
      enabled: config.tools.enabled,
      scope: 'server',
      tools: registry.list().map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        scope: tool.scope,
        allowlisted: config.tools.allowlist.length === 0
          ? config.tools.enabled
          : config.tools.allowlist.includes(tool.name),
      })),
    });
  });

  return router;
}
