import { useEffect, useState } from 'react';
import type { LunaApiClient, ServerTool, UserSettings } from '../api';
import { LOCALES, localeLabelKey, type Locale } from '../i18n';
import { useI18n } from '../i18n-context';

interface Props {
  client: LunaApiClient;
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ client, settings, onChange, onClose }: Props) {
  const { t, locale, setLocale } = useI18n();
  const [tools, setTools] = useState<{ enabled: boolean; scope: string; tools: ServerTool[] } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    client
      .listTools()
      .then(setTools)
      .catch(() => setTools(null));
  }, [client]);

  const persist = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    try {
      const response = await client.updateSettings(patch);
      onChange(response.settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch {
      /* keep the optimistic value; the next successful save will reconcile */
    }
  };

  const selectLocale = (next: Locale) => {
    setLocale(next);
    void persist({ language: next });
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
      <div className="panel">
        <header className="panel__header">
          <h2>{t('settings.title')}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('action.cancel')}
          </button>
        </header>

        <section className="panel__section">
          <h3>{t('language.label')}</h3>
          <p className="muted">{t('settings.language.description')}</p>
          <div className="choices">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                className={`button ${code === locale ? 'button--primary' : 'button--ghost'}`}
                onClick={() => selectLocale(code)}
              >
                {t(localeLabelKey(code))}
              </button>
            ))}
          </div>
        </section>

        <section className="panel__section">
          <h3>{t('settings.appearance')}</h3>
          <div className="choices">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                className={`button ${settings.theme === theme ? 'button--primary' : 'button--ghost'}`}
                onClick={() => void persist({ theme })}
              >
                {t(`settings.theme.${theme}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="panel__section">
          <h3>{t('settings.tools')}</h3>
          <p className="muted">{t('settings.tools.description')}</p>
          <p>
            <strong>{tools ? t('settings.tools.enabled') : t('settings.tools.disabled')}</strong>
          </p>
          <ul className="tools">
            {(tools?.tools ?? []).map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code> — {tool.description}
              </li>
            ))}
          </ul>
          <p className="muted">{t('notice.noLocalAccess')}</p>
        </section>

        <section className="panel__section">
          <h3>{t('settings.provider')}</h3>
          <p className="muted">{t('settings.provider.configured')}</p>
        </section>

        {saved && <p className="banner banner--muted">{t('action.save')} ✓</p>}
      </div>
    </div>
  );
}
