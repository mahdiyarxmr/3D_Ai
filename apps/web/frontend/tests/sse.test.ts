import { describe, expect, it } from 'vitest';
import { parseSse } from '../src/sse';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

async function collect(chunks: string[]) {
  const events = [];
  for await (const event of parseSse(streamFrom(chunks))) events.push(event);
  return events;
}

describe('SSE parser', () => {
  it('parses complete events', async () => {
    const events = await collect(['event: delta\ndata: {"text":"hi"}\n\n', 'event: done\ndata: {"content":"hi"}\n\n']);
    expect(events).toEqual([
      { event: 'delta', data: { text: 'hi' } },
      { event: 'done', data: { content: 'hi' } },
    ]);
  });

  it('reassembles events split across network chunks', async () => {
    const events = await collect(['event: del', 'ta\ndata: {"te', 'xt":"split"}\n\n']);
    expect(events).toEqual([{ event: 'delta', data: { text: 'split' } }]);
  });

  it('ignores keep-alive comments and malformed payloads', async () => {
    const events = await collect([': keep-alive\n\n', 'event: delta\ndata: not-json\n\n']);
    expect(events).toEqual([{ event: 'delta', data: 'not-json' }]);
  });

  it('flushes a trailing event without a final blank line', async () => {
    const events = await collect(['event: done\ndata: {"content":"end"}']);
    expect(events).toEqual([{ event: 'done', data: { content: 'end' } }]);
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    const iterator = parseSse(streamFrom(['event: delta\ndata: {"text":"a"}\n\n']), {
      signal: controller.signal,
    });
    const first = await iterator.next();
    expect(first.value).toEqual({ event: 'delta', data: { text: 'a' } });
    controller.abort();
    const second = await iterator.next();
    expect(second.done).toBe(true);
  });
});
