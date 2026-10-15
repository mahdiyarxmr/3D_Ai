import { EXECUTION_SCOPE } from './registry.js';

/**
 * Server-side tool policy.
 *
 * Every tool invocation is authorised here before execution. The policy can only
 * ever narrow the deployment's configuration; it can never widen it.
 */
export function authorizeToolInvocation({ registry, toolCall, config }) {
  if (!config.tools.enabled) {
    return { allowed: false, reason: 'server_tools_disabled' };
  }

  const name = toolCall?.function?.name || toolCall?.name;
  if (!name) return { allowed: false, reason: 'missing_tool_name' };

  const tool = registry.get(name);
  if (!tool) return { allowed: false, reason: 'unknown_tool' };

  if (tool.scope !== EXECUTION_SCOPE.SERVER) {
    return { allowed: false, reason: 'non_server_scope_denied' };
  }

  if (config.tools.allowlist.length > 0 && !config.tools.allowlist.includes(name)) {
    return { allowed: false, reason: 'tool_not_allowlisted' };
  }

  return { allowed: true, tool };
}

export function parseToolArguments(toolCall) {
  const raw = toolCall?.function?.arguments ?? toolCall?.arguments ?? '{}';
  if (typeof raw !== 'string') return raw ?? {};
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error('invalid_tool_arguments');
  }
}
