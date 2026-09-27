import { create } from 'zustand';
import {
  Agent,
  EmergencyStop,
  MockLlmProvider,
  ToolBroker,
  getTool,
  toolDeclarations,
  visibleTools,
  type AgentEvent,
  type ConfirmationProvider,
  type ConfirmationRequest,
  type AuditRecord,
  type PermissionContext,
  type RiskLevel,
} from '@hermes/agent-protocol';
import {
  buildPersonaPrompt,
  defaultCharacter,
  defaultSettings,
  type Character,
  type Emotion,
  type Settings,
  type SupportedLanguage,
} from '@hermes/shared';
import { createExecutor } from '../runtime/executors.js';
import { storage } from '../runtime/storage.js';

export type ViewMode = 'companion' | 'expanded';
export type Panel = 'chat' | 'agent' | 'character' | 'voice' | 'settings' | 'audit';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  emotion?: Emotion;
  pending?: boolean;
}

export interface ActivityEntry {
  callId: string;
  tool: string;
  args: unknown;
  status: 'running' | 'ok' | 'failed' | 'denied' | 'verifying';
  summary?: string;
  at: string;
  risk?: RiskLevel;
}

interface PendingConfirmation extends ConfirmationRequest {
  expiresAt: number;
  resolve: (approved: boolean) => void;
}

interface HermesState {
  ready: boolean;
  mode: ViewMode;
  panel: Panel;
  settings: Settings;
  characters: Character[];
  activeCharacter: Character;
  messages: ChatMessage[];
  activity: ActivityEntry[];
  audit: AuditRecord[];
  pendingConfirmation: PendingConfirmation | null;
  emergencyStopped: boolean;
  agentBusy: boolean;
  emotion: Emotion;
  speaking: boolean;
  vrmLoaded: boolean;
  statusText: string;

  init: () => Promise<void>;
  setMode: (mode: ViewMode) => void;
  setPanel: (panel: Panel) => void;
  patchSettings: (patch: DeepPartial<Settings>) => Promise<void>;
  setUiLanguage: (language: SupportedLanguage) => Promise<void>;
  setConversationLanguage: (language: SupportedLanguage) => Promise<void>;
  saveCharacter: (character: Character) => Promise<void>;
  setActiveCharacter: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  resolveConfirmation: (approved: boolean) => void;
  triggerEmergencyStop: () => void;
  releaseEmergencyStop: () => void;
  setEmotion: (emotion: Emotion) => void;
  setVrmLoaded: (loaded: boolean) => void;
  refreshAudit: () => Promise<void>;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeDeep((base as Record<string, unknown>)[key] as never, value as never);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

const emergencyStop = new EmergencyStop();
const executor = createExecutor();
const provider = new MockLlmProvider();

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`;
}

export const useHermes = create<HermesState>((set, get) => {
  const confirmations: ConfirmationProvider = {
    request(req) {
      return new Promise<boolean>((resolve) => {
        const timeoutMs = get().settings.agent.confirmationTimeoutMs;
        const timer = setTimeout(() => {
          if (get().pendingConfirmation?.callId === req.callId) {
            set({ pendingConfirmation: null });
            resolve(false);
          }
        }, timeoutMs);

        set({
          pendingConfirmation: {
            ...req,
            expiresAt: Date.now() + timeoutMs,
            resolve: (approved: boolean) => {
              clearTimeout(timer);
              resolve(approved);
            },
          },
        });
      });
    },
  };

  const broker = new ToolBroker({
    audit: storage.audit,
    emergencyStop,
    confirmations,
    executor,
    getContext: (): PermissionContext => {
      const { agent } = get().settings;
      return {
        level: agent.permissionLevel,
        toolAllowlist: agent.toolAllowlist,
        toolDenylist: agent.toolDenylist,
        filesystemScopes: agent.filesystemScopes,
        emergencyStopActive: emergencyStop.isActive,
      };
    },
  });

  function onAgentEvent(event: AgentEvent) {
    const state = get();
    switch (event.type) {
      case 'started':
        set({ agentBusy: true, statusText: 'thinking' });
        break;
      case 'thinking':
        set({
          statusText: 'thinking',
          messages: [...get().messages, { id: newId(), role: 'system', text: event.thought, at: new Date().toISOString() }],
        });
        break;
      case 'tool.started':
        set({
          statusText: 'working',
          activity: [
            {
              status: 'running' as const,
              callId: event.callId,
              tool: event.tool,
              args: event.args,
              at: new Date().toISOString(),
              risk: getTool(event.tool)?.risk,
            },
            ...get().activity,
          ].slice(0, 100),
        });
        break;
      case 'tool.completed':
        set({
          activity: get().activity.map((entry) =>
            entry.callId === event.callId ? { ...entry, status: event.ok ? 'ok' : 'failed', summary: event.summary } : entry,
          ),
        });
        break;
      case 'verifying':
        set({
          activity: get().activity.map((entry) => (entry.callId === event.callId ? { ...entry, status: 'verifying' } : entry)),
        });
        break;
      case 'message':
        set({
          emotion: event.emotion,
          messages: [
            ...get().messages.filter((m) => !m.pending),
            { id: newId(), role: 'assistant', text: event.text, at: new Date().toISOString(), emotion: event.emotion },
          ],
        });
        break;
      case 'completed':
        set({ agentBusy: false, statusText: 'idle' });
        void get().refreshAudit();
        break;
      case 'interrupted':
        set({
          agentBusy: false,
          statusText: event.reason === 'emergency_stop' ? 'stopped' : 'idle',
          messages: [
            ...get().messages.filter((m) => !m.pending),
            { id: newId(), role: 'system', text: `interrupted: ${event.reason}`, at: new Date().toISOString() },
          ],
        });
        void get().refreshAudit();
        break;
    }
    void state;
  }

  const agent = new Agent({ provider, broker, emergencyStop, emit: onAgentEvent });

  emergencyStop.onChange((active) => set({ emergencyStopped: active }));

  return {
    ready: false,
    mode: 'expanded',
    panel: 'chat',
    settings: defaultSettings(),
    characters: [],
    activeCharacter: defaultCharacter(),
    messages: [],
    activity: [],
    audit: [],
    pendingConfirmation: null,
    emergencyStopped: false,
    agentBusy: false,
    emotion: 'neutral',
    speaking: false,
    vrmLoaded: false,
    statusText: 'idle',

    async init() {
      // Never let a storage failure leave the UI stuck on the boot screen.
      // `ready` gates the entire shell, so anything thrown here used to render
      // as a permanently blank window with the cause swallowed by `void init()`.
      try {
        const [settings, characters] = await Promise.all([storage.loadSettings(), storage.listCharacters()]);
        const active =
          characters.find((c) => c.id === settings.character.activeCharacterId) ??
          characters[0] ??
          defaultCharacter({ name: 'HERMES' });
        set({ ready: true, settings, characters, activeCharacter: active });
      } catch (error) {
        console.error('[hermes] init failed; starting with defaults', error);
        set({
          ready: true,
          settings: defaultSettings(),
          characters: [],
          activeCharacter: defaultCharacter({ name: 'HERMES' }),
          statusText: 'error',
        });
      }
      try {
        await get().refreshAudit();
      } catch (error) {
        console.error('[hermes] audit load failed', error);
      }
    },

    setMode(mode) {
      set({ mode });
    },

    setPanel(panel) {
      set({ panel });
    },

    async patchSettings(patch) {
      const settings = mergeDeep(get().settings, patch);
      set({ settings });
      await storage.saveSettings(settings);
    },

    async setUiLanguage(language) {
      await get().patchSettings({ general: { uiLanguage: language } });
    },

    async setConversationLanguage(language) {
      await get().patchSettings({ conversation: { language } });
    },

    async saveCharacter(character) {
      const updated = { ...character, updatedAt: new Date().toISOString() };
      await storage.saveCharacter(updated);
      const characters = await storage.listCharacters();
      set({ characters, activeCharacter: updated });
      await get().patchSettings({ character: { activeCharacterId: updated.id } });
    },

    async setActiveCharacter(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) return;
      set({ activeCharacter: character, vrmLoaded: false });
      await get().patchSettings({ character: { activeCharacterId: id } });
    },

    async send(text) {
      const trimmed = text.trim();
      if (!trimmed || get().agentBusy) return;
      if (emergencyStop.isActive) emergencyStop.reset();

      const { settings, activeCharacter } = get();
      set({
        messages: [...get().messages, { id: newId(), role: 'user', text: trimmed, at: new Date().toISOString() }],
      });

      const language = settings.conversation.language;
      const permitted = new Set(
        visibleTools({
          level: settings.agent.permissionLevel,
          toolAllowlist: settings.agent.toolAllowlist,
          toolDenylist: settings.agent.toolDenylist,
        }),
      );

      await agent.run({
        goal: trimmed,
        systemPrompt: buildPersonaPrompt(activeCharacter, language),
        language,
        maxIterations: settings.agent.maxIterations,
        availableTools: toolDeclarations().filter((tool) => permitted.has(tool.name)),
      });
    },

    resolveConfirmation(approved) {
      const pending = get().pendingConfirmation;
      if (!pending) return;
      set({ pendingConfirmation: null });
      pending.resolve(approved);
      if (!approved) {
        set({
          activity: get().activity.map((entry) => (entry.callId === pending.callId ? { ...entry, status: 'denied' } : entry)),
        });
      }
    },

    triggerEmergencyStop() {
      emergencyStop.trigger('user');
      const pending = get().pendingConfirmation;
      if (pending) {
        set({ pendingConfirmation: null });
        pending.resolve(false);
      }
      set({ agentBusy: false, statusText: 'stopped' });
      void get().refreshAudit();
    },

    releaseEmergencyStop() {
      emergencyStop.reset();
      set({ statusText: 'idle' });
    },

    setEmotion(emotion) {
      set({ emotion });
    },

    setVrmLoaded(loaded) {
      set({ vrmLoaded: loaded });
    },

    async refreshAudit() {
      const audit = await storage.audit.query({ limit: 200 });
      set({ audit });
    },
  };
});

export { emergencyStop };
