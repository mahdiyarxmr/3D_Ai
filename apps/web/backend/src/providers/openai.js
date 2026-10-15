import { normalizeChunk } from './index.js';

/**
 * OpenAI-compatible chat completions provider (streaming).
 *
 * Works with any OpenAI-compatible endpoint via OPENAI_BASE_URL.
 * The API key is read from server-side configuration and never leaves the server.
 */
export function createOpenAIProvider({ apiKey, baseUrl, model }) {
  return {
    id: 'openai',
    isMock: false,
    async *streamChat({ messages, tools, signal }) {
      const body = {
        model,
        stream: true,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (tools?.length) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        throw new Error(`provider_error:${response.status}:${detail.slice(0, 200)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          let json;
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          const chunk = normalizeChunk(json);
          if (chunk) yield chunk;
        }
      }
    },
  };
}
