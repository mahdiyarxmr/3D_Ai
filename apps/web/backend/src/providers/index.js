import { createEchoProvider } from './echo.js';
import { createOpenAIProvider } from './openai.js';

/**
 * Provider abstraction for LunaAI Web.
 *
 * A provider only ever receives conversation messages and server-side tool
 * definitions. It has no capability handle and therefore cannot reach a user's
 * computer (see docs/WEB_ARCHITECTURE.md, "Trust boundary").
 */
export function createProvider(config) {
  if (config.provider.name === 'echo' || !config.provider.apiKey) {
    return createEchoProvider();
  }
  return createOpenAIProvider(config.provider);
}

/**
 * Convert a raw OpenAI-style streaming event into a normalised chunk:
 *   { type: 'text', text } | { type: 'tool_calls', toolCalls }
 */
export function normalizeChunk(json) {
  const choice = json?.choices?.[0];
  if (!choice) return null;
  const delta = choice.delta || {};
  if (typeof delta.content === 'string' && delta.content.length > 0) {
    return { type: 'text', text: delta.content };
  }
  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    return { type: 'tool_calls', toolCalls: delta.tool_calls };
  }
  return null;
}
