/**
 * Platform abstraction.
 *
 * HERMES ships as a Tauri app, but the same React bundle must also run in a
 * plain browser so the UI can be developed and reviewed without a Rust
 * toolchain (docs/DEVELOPMENT.md: "Run the desktop UI without AI services").
 *
 * In the browser everything that needs the OS is routed to a clearly-labelled
 * simulation. Nothing silently pretends to have touched the machine — every
 * simulated result says so, in the UI and in the audit log.
 */

export type Runtime = 'tauri' | 'browser';

export function detectRuntime(): Runtime {
  const w = globalThis as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return w.__TAURI_INTERNALS__ || w.__TAURI__ ? 'tauri' : 'browser';
}

export const RUNTIME: Runtime = detectRuntime();
export const IS_TAURI = RUNTIME === 'tauri';

/** Lazily import a Tauri module; returns null in the browser. */
export async function tauri<T>(loader: () => Promise<T>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error(`Tauri command '${command}' is unavailable in the browser runtime`);
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}
