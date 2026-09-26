import React from 'react';
import { Bidi, Section, Select, Slider, Toggle, useI18n, useT } from '@hermes/ui';
import { SUPPORTED_LANGUAGES, type PermissionLevel, type SupportedLanguage } from '@hermes/shared';
import { TOOL_IDS } from '@hermes/agent-protocol';
import { useHermes } from '../state/store.js';
import { RUNTIME, IS_TAURI } from '../runtime/platform.js';

const LANGUAGE_LABEL_KEYS: Record<SupportedLanguage, string> = {
  en: 'language.english',
  ja: 'language.japanese',
  fa: 'language.persian',
};

export function SettingsPanel() {
  const t = useT();
  const { missingKeys } = useI18n();
  const settings = useHermes((s) => s.settings);
  const patch = useHermes((s) => s.patchSettings);
  const setUiLanguage = useHermes((s) => s.setUiLanguage);

  return (
    <div className="panel settings-panel">
      <header className="panel-head">
        <h2>{t('settings:title')}</h2>
      </header>

      <Section title={t('settings:sections.general')}>
        <Select
          label={t('settings:general.uiLanguage')}
          hint={t('language.independentHint')}
          value={settings.general.uiLanguage}
          onChange={(value) => void setUiLanguage(value as SupportedLanguage)}
          options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang, label: t(LANGUAGE_LABEL_KEYS[lang]) }))}
        />
        <Select
          label={t('language.conversation')}
          value={settings.conversation.language}
          onChange={(value) => void patch({ conversation: { language: value as SupportedLanguage } })}
          options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang, label: t(LANGUAGE_LABEL_KEYS[lang]) }))}
        />
        <Toggle
          label={t('settings:general.alwaysOnTop')}
          checked={settings.general.alwaysOnTop}
          onChange={(checked) => void patch({ general: { alwaysOnTop: checked } })}
        />
        <Toggle
          label={t('settings:general.minimiseToTray')}
          checked={settings.general.minimiseToTray}
          onChange={(checked) => void patch({ general: { minimiseToTray: checked } })}
        />
        <Toggle
          label={t('settings:general.startOnLogin')}
          hint={IS_TAURI ? undefined : t('error.todo')}
          checked={settings.general.startOnLogin}
          disabled={!IS_TAURI}
          onChange={(checked) => void patch({ general: { startOnLogin: checked } })}
        />
      </Section>

      <Section title={t('settings:sections.agent')}>
        <Select
          label={t('settings:agent.permissionLevel')}
          hint={t(`permissions:levelDescriptions.${settings.agent.permissionLevel}`)}
          value={settings.agent.permissionLevel}
          onChange={(value) => void patch({ agent: { permissionLevel: value as PermissionLevel } })}
          options={(['OBSERVE', 'ASSIST', 'AUTONOMOUS'] as PermissionLevel[]).map((level) => ({
            value: level,
            label: t(`permissions:levels.${level}`),
          }))}
        />

        <fieldset className="field">
          <legend>{t('settings:agent.toolDenylist')}</legend>
          <p className="field-hint">{t('settings:agent.toolDenylistHint')}</p>
          <div className="chip-grid">
            {TOOL_IDS.map((id) => {
              const blocked = settings.agent.toolDenylist.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={blocked}
                  className={`chip${blocked ? ' is-blocked' : ''}`}
                  onClick={() =>
                    void patch({
                      agent: {
                        toolDenylist: blocked
                          ? settings.agent.toolDenylist.filter((x) => x !== id)
                          : [...settings.agent.toolDenylist, id],
                      },
                    })
                  }
                >
                  <Bidi as="code">{id}</Bidi>
                </button>
              );
            })}
          </div>
        </fieldset>

        <FilesystemScopes />

        <Slider
          label={t('settings:agent.maxIterations')}
          value={settings.agent.maxIterations}
          min={1}
          max={30}
          step={1}
          onChange={(value) => void patch({ agent: { maxIterations: Math.round(value) } })}
          format={(v) => String(Math.round(v))}
        />
        <Slider
          label={t('settings:agent.confirmationTimeout')}
          value={settings.agent.confirmationTimeoutMs / 1000}
          min={5}
          max={600}
          step={5}
          onChange={(value) => void patch({ agent: { confirmationTimeoutMs: Math.round(value) * 1000 } })}
          format={(v) => `${Math.round(v)}s`}
        />
      </Section>

      <Section title={t('settings:sections.ai')}>
        <Select
          label={t('settings:ai.llmProvider')}
          value={settings.ai.llmProvider}
          onChange={(value) => void patch({ ai: { llmProvider: value } })}
          options={[
            { value: 'mock', label: t('settings:ai.providerMock') },
            { value: 'local', label: t('settings:ai.providerLocal') },
            { value: 'openai', label: t('settings:ai.providerOpenAI') },
          ]}
        />
        <p className="field-hint">{t('settings:ai.credentialHint')}</p>
      </Section>

      <Section title={t('settings:sections.privacy')}>
        <Toggle
          label={t('settings:privacy.allowCloudLlm')}
          checked={settings.privacy.allowCloudLlm}
          onChange={(checked) => void patch({ privacy: { allowCloudLlm: checked } })}
        />
        <Toggle
          label={t('settings:privacy.allowCloudVision')}
          checked={settings.privacy.allowCloudVision}
          onChange={(checked) => void patch({ privacy: { allowCloudVision: checked } })}
        />
        <Toggle
          label={t('settings:privacy.allowCloudAudio')}
          checked={settings.privacy.allowCloudAudio}
          onChange={(checked) => void patch({ privacy: { allowCloudAudio: checked } })}
        />
        <p className="field-hint">{t('settings:privacy.telemetryOff')}</p>
      </Section>

      <Section title={t('settings:sections.joyai')}>
        <p className="field-hint">{t('settings:joyai.optional')}</p>
        <Toggle
          label={t('settings:joyai.enabled')}
          checked={settings.joyai.enabled}
          onChange={(checked) => void patch({ joyai: { enabled: checked } })}
        />
      </Section>

      <Section title={t('settings:sections.advanced')}>
        <Toggle
          label={t('settings:advanced.developerMode')}
          checked={settings.advanced.developerMode}
          onChange={(checked) => void patch({ advanced: { developerMode: checked } })}
        />
        <p className="field-hint">
          {t('settings:advanced.serviceStatus')}: <Bidi as="code">{RUNTIME}</Bidi>
        </p>
        {settings.advanced.developerMode && missingKeys.length > 0 && (
          <div className="warning">
            <strong>Missing translations ({missingKeys.length})</strong>
            <ul>
              {missingKeys.slice(0, 20).map((key) => (
                <li key={key}>
                  <Bidi as="code">{key}</Bidi>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function FilesystemScopes() {
  const t = useT();
  const scopes = useHermes((s) => s.settings.agent.filesystemScopes);
  const patch = useHermes((s) => s.patchSettings);
  const [draft, setDraft] = React.useState('');

  return (
    <fieldset className="field">
      <legend>{t('settings:agent.filesystemScopes')}</legend>
      <p className="field-hint">{t('settings:agent.filesystemScopesHint')}</p>
      {scopes.length === 0 && <p className="empty">{t('permissions:scopes.empty')}</p>}
      <ul className="scope-list">
        {scopes.map((scope) => (
          <li key={scope}>
            <Bidi as="code">{scope}</Bidi>
            <button
              type="button"
              className="ghost"
              onClick={() => void patch({ agent: { filesystemScopes: scopes.filter((s) => s !== scope) } })}
            >
              {t('permissions:scopes.remove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="scope-add">
        <input
          type="text"
          dir="ltr"
          value={draft}
          placeholder="C:\Users\you\Documents"
          aria-label={t('permissions:scopes.add')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className="secondary"
          disabled={draft.trim().length === 0}
          onClick={() => {
            const value = draft.trim();
            if (value && !scopes.includes(value)) void patch({ agent: { filesystemScopes: [...scopes, value] } });
            setDraft('');
          }}
        >
          {t('permissions:scopes.add')}
        </button>
      </div>
    </fieldset>
  );
}
