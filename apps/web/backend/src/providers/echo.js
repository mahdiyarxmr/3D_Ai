/**
 * Deterministic development provider.
 *
 * Used when no provider API key is configured (local development and tests).
 * It never contacts the network and never claims to be a real model.
 */
export function createEchoProvider({ delayMs = 0 } = {}) {
  return {
    id: 'echo',
    isMock: true,
    async *streamChat({ messages, signal }) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const text = [
        '[development provider — no AI provider key configured]',
        `Received ${messages.length} message(s).`,
        lastUser ? `Last user message: ${lastUser.content.slice(0, 500)}` : 'No user message.',
      ].join('\n');

      for (const word of text.split(/(\s+)/)) {
        if (signal?.aborted) return;
        if (word) {
          yield { type: 'text', text: word };
          if (delayMs > 0) await sleep(delayMs, signal);
        }
      }
    },
  };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
