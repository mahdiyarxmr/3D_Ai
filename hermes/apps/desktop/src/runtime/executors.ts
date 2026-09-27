import type { ToolExecutor, ToolResult } from '@hermes/agent-protocol';
import { IS_TAURI, invokeCommand } from './platform.js';

/**
 * Executors.
 *
 * `TauriToolExecutor` forwards an *already-authorised* call to the Rust core,
 * which performs its own independent capability check before touching the OS
 * (defence in depth — see src-tauri/src/tools.rs).
 *
 * `SimulatedToolExecutor` is used when running outside Tauri. It never touches
 * the host: it returns plausible, explicitly-labelled fake data so the agent
 * loop, permission engine and UI can be exercised end to end.
 */

export class TauriToolExecutor implements ToolExecutor {
  async execute(toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
    if (signal.aborted) return { ok: false, summary: 'aborted before execution', error: 'aborted' };
    try {
      const data = await invokeCommand<{ summary: string; data?: unknown }>('execute_tool', {
        request: { tool: toolId, args },
      });
      return { ok: true, summary: data.summary, data: data.data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: `failed: ${message}`, error: message };
    }
  }
}

const SIM = '[simulated]';

export class SimulatedToolExecutor implements ToolExecutor {
  async execute(toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
    await pause(220 + Math.random() * 260, signal);
    if (signal.aborted) return { ok: false, summary: 'aborted', error: 'aborted' };

    switch (toolId) {
      case 'computer.screenshot':
        return {
          ok: true,
          summary: `${SIM} captured display ${args.display ?? 0} at 2560×1440`,
          data: { width: 2560, height: 1440, imageRef: 'sim://screenshot/latest', simulated: true },
        };
      case 'system.info':
        return {
          ok: true,
          summary: `${SIM} Windows 11 · 16 logical cores · 32 GB RAM · 1 display`,
          data: { os: 'Windows 11 (simulated)', cores: 16, memoryGb: 32, displays: 1, simulated: true },
        };
      case 'system.processes': {
        const limit = Number(args.limit ?? 100);
        const names = ['explorer.exe', 'chrome.exe', 'code.exe', 'hermes.exe', 'Discord.exe', 'steam.exe'];
        const processes = names.slice(0, Math.min(limit, names.length)).map((name, i) => ({
          pid: 1000 + i * 37,
          name,
          memoryMb: 80 + i * 145,
        }));
        return { ok: true, summary: `${SIM} ${processes.length} processes`, data: { processes, simulated: true } };
      }
      case 'applications.list_windows': {
        const windows = [
          { id: 'w1', title: 'HERMES', bounds: { x: 1600, y: 60, width: 420, height: 720 } },
          { id: 'w2', title: 'Visual Studio Code — hermes', bounds: { x: 0, y: 0, width: 1600, height: 1400 } },
          { id: 'w3', title: 'Notepad — notes.txt', bounds: { x: 200, y: 200, width: 800, height: 600 } },
        ];
        return { ok: true, summary: `${SIM} ${windows.length} open windows`, data: { windows, simulated: true } };
      }
      case 'filesystem.list':
        return {
          ok: true,
          summary: `${SIM} 3 entries in ${String(args.path)}`,
          data: { entries: [{ name: 'notes.txt', kind: 'file', size: 1042 }, { name: 'models', kind: 'dir' }, { name: 'todo.md', kind: 'file', size: 318 }], simulated: true },
        };
      case 'filesystem.read':
        return { ok: true, summary: `${SIM} read ${String(args.path)} (0 bytes — simulation)`, data: { content: '', simulated: true } };
      case 'shell.cmd':
      case 'shell.powershell':
        return {
          ok: true,
          summary: `${SIM} command not executed (browser runtime)`,
          data: { stdout: '', stderr: '', exitCode: 0, simulated: true },
        };
      default:
        return { ok: true, summary: `${SIM} ${toolId} acknowledged`, data: { args, simulated: true } };
    }
  }
}

export function createExecutor(): ToolExecutor {
  return IS_TAURI ? new TauriToolExecutor() : new SimulatedToolExecutor();
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
