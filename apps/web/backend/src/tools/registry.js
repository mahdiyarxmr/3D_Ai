/**
 * Server-side tool registry for LunaAI Web.
 *
 * Hard rule (see docs/SECURITY.md): tools execute on the server only. There is
 * no registration path for local-computer capabilities — no shell, no
 * filesystem, no mouse/keyboard, no remote control of a user's machine.
 */

export const EXECUTION_SCOPE = Object.freeze({
  /** Runs on the LunaAI Web server, inside the deployment's sandbox. */
  SERVER: 'server',
});

const FORBIDDEN_CAPABILITY_MARKERS = [
  'shell',
  'exec',
  'process',
  'filesystem',
  'file_system',
  'mouse',
  'keyboard',
  'screenshot',
  'desktop',
  'window',
  'computer',
  'powershell',
  'registry',
  'webcam',
];

export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.handler !== 'function') {
      throw new Error('invalid_tool_definition');
    }
    if (tool.scope !== EXECUTION_SCOPE.SERVER) {
      throw new Error(`tool_scope_not_allowed:${tool.scope}`);
    }
    const name = tool.name.toLowerCase();
    for (const marker of FORBIDDEN_CAPABILITY_MARKERS) {
      if (name.includes(marker)) {
        throw new Error(`tool_capability_forbidden:${tool.name}`);
      }
    }
    if (this.#tools.has(tool.name)) {
      throw new Error(`tool_already_registered:${tool.name}`);
    }
    this.#tools.set(tool.name, Object.freeze({ ...tool }));
    return this;
  }

  get(name) {
    return this.#tools.get(name);
  }

  has(name) {
    return this.#tools.has(name);
  }

  list() {
    return [...this.#tools.values()];
  }

  /** OpenAI-style tool definitions, filtered by the deployment allowlist. */
  definitions(allowlist = []) {
    const allowed = allowlist.length > 0 ? new Set(allowlist) : null;
    return this.list()
      .filter((tool) => !allowed || allowed.has(tool.name))
      .map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }
}
