import React, { useEffect } from 'react';
import { I18nProvider, useT } from '@hermes/ui';
import { resources } from './locales.js';
import { useHermes, type Panel } from './state/store.js';
import { CompanionMode } from './screens/CompanionMode.js';
import { ChatPanel } from './screens/ChatPanel.js';
import { AgentPanel } from './screens/AgentPanel.js';
import { CharacterPanel } from './screens/CharacterPanel.js';
import { VoicePanel } from './screens/VoicePanel.js';
import { SettingsPanel } from './screens/SettingsPanel.js';
import { AuditPanel } from './screens/AuditPanel.js';
import { PermissionDialog } from './components/PermissionDialog.js';
import { TrayBridge } from './components/TrayMenu.js';
import { AvatarCanvas } from './components/AvatarCanvas.js';
import { RUNTIME } from './runtime/platform.js';

const PANELS: { id: Panel; labelKey: string }[] = [
  { id: 'chat', labelKey: 'nav.chat' },
  { id: 'agent', labelKey: 'nav.agent' },
  { id: 'character', labelKey: 'nav.character' },
  { id: 'voice', labelKey: 'nav.voice' },
  { id: 'audit', labelKey: 'nav.audit' },
  { id: 'settings', labelKey: 'nav.settings' },
];

export function App() {
  const ready = useHermes((s) => s.ready);
  const init = useHermes((s) => s.init);
  const uiLanguage = useHermes((s) => s.settings.general.uiLanguage);
  const setUiLanguage = useHermes((s) => s.setUiLanguage);
  const developerMode = useHermes((s) => s.settings.advanced.developerMode);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <I18nProvider
      resources={resources}
      language={uiLanguage}
      onLanguageChange={(language) => void setUiLanguage(language)}
      trackMissing={developerMode}
    >
      <TrayBridge />
      {ready ? <Shell /> : <div className="boot">…</div>}
      <PermissionDialog />
    </I18nProvider>
  );
}

function Shell() {
  const mode = useHermes((s) => s.mode);
  return mode === 'companion' ? <CompanionMode /> : <ExpandedMode />;
}

function ExpandedMode() {
  const t = useT();
  const panel = useHermes((s) => s.panel);
  const setPanel = useHermes((s) => s.setPanel);
  const setMode = useHermes((s) => s.setMode);
  const status = useHermes((s) => s.statusText);
  const stopped = useHermes((s) => s.emergencyStopped);
  const triggerStop = useHermes((s) => s.triggerEmergencyStop);
  const releaseStop = useHermes((s) => s.releaseEmergencyStop);
  const name = useHermes((s) => s.activeCharacter.name);

  // Global emergency stop hotkey. Works regardless of focus within the window;
  // the Rust side registers the OS-wide shortcut (src-tauri/src/shortcuts.rs).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && (event.key === 'Escape' || event.code === 'Escape')) {
        event.preventDefault();
        triggerStop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triggerStop]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <AvatarCanvas className="avatar-canvas sidebar-avatar" interactive={false} />
          <div className="brand-text">
            <strong>{name}</strong>
            <span className={`status-line status-${status}`}>{t(`status.${status}`)}</span>
          </div>
        </div>

        <nav aria-label={t('app.name')}>
          {PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${panel === item.id ? ' is-active' : ''}`}
              aria-current={panel === item.id ? 'page' : undefined}
              onClick={() => setPanel(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="secondary" onClick={() => setMode('companion')}>
            {t('mode.toCompanion')}
          </button>
          <button type="button" className={`danger${stopped ? ' is-engaged' : ''}`} onClick={triggerStop} title={t('emergency.hint')}>
            {t('emergency.stop')}
          </button>
          <p className="runtime-note">runtime: {RUNTIME}</p>
        </div>
      </aside>

      <main className="content">
        {stopped && (
          <div className="banner banner-danger" role="alert">
            <span>{t('emergency.engaged')}</span>
            <button type="button" className="secondary" onClick={releaseStop}>
              {t('emergency.release')}
            </button>
          </div>
        )}
        {panel === 'chat' && <ChatPanel />}
        {panel === 'agent' && <AgentPanel />}
        {panel === 'character' && <CharacterPanel />}
        {panel === 'voice' && <VoicePanel />}
        {panel === 'audit' && <AuditPanel />}
        {panel === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
