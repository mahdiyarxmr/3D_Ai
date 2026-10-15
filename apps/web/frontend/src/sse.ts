export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Incremental parser for `text/event-stream` responses.
 *
 * Kept dependency-free and stream-agnostic so it can be unit tested with any
 * ReadableStream and reused by both the chat view and the fetch client.
 */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
  { signal }: { signal?: AbortSignal } = {}
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
        separator = buffer.indexOf('\n\n');
      }
    }
    const tail = parseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock?.();
  }
}

function parseBlock(block: string): SseEvent | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }

  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}
