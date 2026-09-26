import { z } from 'zod';
import { SupportedLanguageSchema } from './character.js';

export const PermissionLevelSchema = z.enum(['OBSERVE', 'ASSIST', 'AUTONOMOUS']);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const SettingsSchema = z.object({
  general: z
    .object({
      /** UI chrome language. Independent from conversationLanguage. */
      uiLanguage: SupportedLanguageSchema.default('en'),
      startOnLogin: z.boolean().default(false),
      minimiseToTray: z.boolean().default(true),
      alwaysOnTop: z.boolean().default(true),
      theme: z.enum(['dark', 'light']).default('dark'),
    })
    .default({}),
  conversation: z
    .object({
      /** Language the agent speaks/writes in. Independent from uiLanguage. */
      language: SupportedLanguageSchema.default('en'),
      followUserLanguage: z.boolean().default(true),
    })
    .default({}),
  agent: z
    .object({
      permissionLevel: PermissionLevelSchema.default('OBSERVE'),
      /** Tool ids explicitly allowed. Empty = "all tools the level permits". */
      toolAllowlist: z.array(z.string()).default([]),
      /** Tool ids explicitly denied. Always wins over the allowlist. */
      toolDenylist: z.array(z.string()).default([]),
      /** Absolute directories the filesystem tools may touch. */
      filesystemScopes: z.array(z.string()).default([]),
      confirmationTimeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
      maxIterations: z.number().int().min(1).max(50).default(12),
    })
    .default({}),
  voice: z
    .object({
      inputEnabled: z.boolean().default(false),
      outputEnabled: z.boolean().default(true),
      inputDeviceId: z.string().nullable().default(null),
      outputDeviceId: z.string().nullable().default(null),
      vadThreshold: z.number().min(0).max(1).default(0.35),
      sttProvider: z.string().default('mock'),
      ttsProvider: z.string().default('mock'),
    })
    .default({}),
  ai: z
    .object({
      llmProvider: z.string().default('mock'),
      visionProvider: z.string().default('mock'),
      /** Never stores the key itself — only which OS keychain entry to read. */
      credentialRef: z.string().nullable().default(null),
    })
    .default({}),
  privacy: z
    .object({
      /** Block any provider call that would upload pixels off-device. */
      allowCloudVision: z.boolean().default(false),
      allowCloudAudio: z.boolean().default(false),
      allowCloudLlm: z.boolean().default(false),
      retainAuditLogDays: z.number().int().min(1).max(3650).default(90),
      telemetry: z.literal(false).default(false),
    })
    .default({}),
  character: z
    .object({
      activeCharacterId: z.string().nullable().default(null),
    })
    .default({}),
  joyai: z
    .object({
      /** JoyAI is optional and OFF by default; the app must run without it. */
      enabled: z.boolean().default(false),
      endpoint: z.string().default('http://127.0.0.1:8734'),
    })
    .default({}),
  advanced: z
    .object({
      developerMode: z.boolean().default(false),
    })
    .default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}
