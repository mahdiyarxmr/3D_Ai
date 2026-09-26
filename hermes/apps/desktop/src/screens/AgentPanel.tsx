import React from 'react';
import { Bidi, RiskBadge, Select, useFormatters, useT } from '@hermes/ui';
import { LEVEL_AUTO_RISK, visibleTools } from '@hermes/agent-protocol';
import type { PermissionLevel } from '@hermes/shared';
import { useHermes } from '../state/store.js';
import { RUNTIME } from '../runtime/platform.js';

const LEVELS: PermissionLevel[] = ['OBSERVE', 'ASSIST', 'AUTONOMOUS'];

export function AgentPanel() {
  const t = useT();
  const fmt = useFormatters();
  const activity = useHermes((s) => s.activity);
  const settings = useHermes((s) => s.settings);
  const patchSettings = useHermes((s) => s.patchSettings);

  const level = settings.agent.permissionLevel;
  const exposed = visibleTools({
    level,
    toolAllowlist: settings.agent.toolAllowlist,
    toolDenylist: settings.agent.toolDenylist,
  });

  return (
    <div className="panel agent-panel">
      <header className="panel-head">
        <h2>{t('agent.title')}</h2>
        <span className="pill">{t('agent.provider')}: mock</span>
        <span className="pill">runtime: {RUNTIME}</span>
      </header>

      <div className="agent-grid">
        <section className="card">
          <h3>{t('permissions:title')}</h3>
          <Select
            label={t('agent.level')}
            value={level}
            onChange={(value) => void patchSettings({ agent: { permissionLevel: value as PermissionLevel } })}
            options={LEVELS.map((l) => ({ value: l, label: t(`permissions:levels.${l}`) }))}
          />
          <p className="field-hint">{t(`permissions:levelDescriptions.${level}`)}</p>
          <p className="field-hint">
            {t('permissions:risk.' + LEVEL_AUTO_RISK[level])} — {t('permissions:request.riskLabel')}
          </p>
          <ul className="tool-list">
            {exposed.map((tool) => (
              <li key={tool}>
                <Bidi as="code">{tool}</Bidi>
                <span>{t(`tools.${tool.replace('.', '.')}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>{t('agent.activity')}</h3>
          {activity.length === 0 && <p className="empty">{t('agent.noActivity')}</p>}
          <ul className="activity">
            {activity.map((entry) => (
              <li key={entry.callId} className={`activity-${entry.status}`}>
                <div className="activity-head">
                  <Bidi as="code">{entry.tool}</Bidi>
                  {entry.risk && <RiskBadge risk={entry.risk} label={t(`permissions:risk.${entry.risk}`)} />}
                  <time dateTime={entry.at}>{fmt.time(entry.at)}</time>
                </div>
                <p className="activity-summary">{entry.status === 'verifying' ? t('agent.verifying') : entry.summary ?? '…'}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
