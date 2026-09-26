import type { Emotion } from '@hermes/shared';
import type { AgentStep, LlmProvider, LlmRequest } from '../agent.js';

/**
 * MockLlmProvider — the default provider until a real one is configured.
 *
 * It is NOT a stub that returns a fixed string: it exercises the full agent
 * loop (plan a tool call, observe the result, then answer) so the permission
 * engine, broker, audit log and UI can all be developed and tested without an
 * API key or a GPU. Swap it for OpenAI/local by implementing `LlmProvider`.
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';
  private counter = 0;

  async complete(request: LlmRequest): Promise<AgentStep> {
    if (request.signal.aborted) throw new Error('aborted');
    await delay(180, request.signal);

    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const goal = (lastUser?.content ?? '').toLowerCase();
    const toolResults = request.messages.filter((m) => m.role === 'tool');
    const available = new Set(request.availableTools.map((t) => t.name));

    // Already observed something -> summarise and finish.
    if (toolResults.length > 0) {
      const last = toolResults[toolResults.length - 1]!;
      let summary = 'the tool returned no summary';
      try {
        const parsed = JSON.parse(last.content) as { summary?: string; ok?: boolean; error?: string };
        summary = parsed.summary ?? parsed.error ?? summary;
      } catch {
        summary = last.content.slice(0, 200);
      }
      return { kind: 'final', text: reply(request, `I ran ${last.name ?? 'the tool'} — ${summary}`), emotion: 'neutral' };
    }

    // Intent routing. Deliberately simple and deterministic.
    const wants = (...keys: string[]) => keys.some((k) => goal.includes(k));

    if (wants('screenshot', 'screen', 'see', 'look', 'スクリーン', 'صفحه', 'اسکرین') && available.has('computer.screenshot')) {
      return {
        kind: 'tool',
        thought: 'I should capture the screen to see what the user is looking at.',
        calls: [{ callId: this.nextId(), tool: 'computer.screenshot', args: { display: 0 } }],
      };
    }

    if (wants('window', 'windows', 'ウィンドウ', 'پنجره') && available.has('applications.list_windows')) {
      return {
        kind: 'tool',
        thought: 'Listing the open windows will answer this.',
        calls: [{ callId: this.nextId(), tool: 'applications.list_windows', args: {} }],
      };
    }

    if (wants('system', 'cpu', 'memory', 'spec', 'システム', 'سیستم') && available.has('system.info')) {
      return {
        kind: 'tool',
        thought: 'Reading system information.',
        calls: [{ callId: this.nextId(), tool: 'system.info', args: {} }],
      };
    }

    if (wants('process', 'running', 'プロセス', 'پردازش') && available.has('system.processes')) {
      return {
        kind: 'tool',
        thought: 'Listing running processes.',
        calls: [{ callId: this.nextId(), tool: 'system.processes', args: { limit: 25 } }],
      };
    }

    // Demonstrates the denial path: requested but not permitted at OBSERVE.
    if (wants('delete', 'remove', '削除', 'حذف')) {
      return {
        kind: 'tool',
        thought: 'The user asked for a deletion. This is destructive, so it must be confirmed.',
        calls: [{ callId: this.nextId(), tool: 'filesystem.delete', args: { path: 'C:/Users/Public/hermes-demo/scratch.txt' } }],
      };
    }

    return { kind: 'final', text: reply(request, greeting(request)), emotion: emotionFor(goal) };
  }

  private nextId(): string {
    this.counter += 1;
    return `call-${Date.now().toString(36)}-${this.counter}`;
  }
}

function greeting(request: LlmRequest): string {
  const count = request.availableTools.length;
  switch (request.language) {
    case 'ja':
      return `モックプロバイダーで動作中です。現在 ${count} 個のツールが利用可能です。実際のLLMプロバイダーは設定から接続できます。`;
    case 'fa':
      return `در حال اجرا با ارائه‌دهنده آزمایشی هستم. در حال حاضر ${count} ابزار در دسترس است. ارائه‌دهنده واقعی را می‌توانید از تنظیمات وصل کنید.`;
    default:
      return `I'm running on the mock provider. ${count} tools are currently available to me. Connect a real LLM provider in Settings → AI.`;
  }
}

function reply(request: LlmRequest, text: string): string {
  return request.language === 'fa' || request.language === 'ja' ? text : text;
}

function emotionFor(goal: string): Emotion {
  if (/thank|thanks|ありがとう|ممنون|مرسی/.test(goal)) return 'happy';
  if (/sorry|error|fail|ごめん|خطا/.test(goal)) return 'sad';
  if (/\?|？|؟/.test(goal)) return 'thinking';
  return 'neutral';
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
