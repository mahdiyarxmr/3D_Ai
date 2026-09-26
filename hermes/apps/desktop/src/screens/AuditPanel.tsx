import React, { useEffect } from 'react';
import { Bidi, RiskBadge, useFormatters, useT } from '@hermes/ui';
import { useHermes } from '../state/store.js';

export function AuditPanel() {
  const t = useT();
  const fmt = useFormatters();
  const audit = useHermes((s) => s.audit);
  const refresh = useHermes((s) => s.refreshAudit);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="panel audit-panel">
      <header className="panel-head">
        <h2>{t('audit.title')}</h2>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          {t('action.retry')}
        </button>
      </header>

      {audit.length === 0 && <p className="empty">{t('audit.empty')}</p>}

      {audit.length > 0 && (
        <table className="audit-table">
          <thead>
            <tr>
              <th>{t('audit.time')}</th>
              <th>{t('audit.tool')}</th>
              <th>{t('audit.risk')}</th>
              <th>{t('audit.outcome')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((record) => (
              <tr key={record.id}>
                <td>
                  <time dateTime={record.at}>{fmt.dateTime(record.at)}</time>
                </td>
                <td>
                  <Bidi as="code">{record.tool}</Bidi>
                </td>
                <td>
                  <RiskBadge risk={record.risk} label={t(`permissions:risk.${record.risk}`)} />
                </td>
                <td>
                  <span className={`outcome outcome-${record.outcome}`}>
                    {t(`audit.outcomes.${record.outcome}`, { defaultValue: record.outcome })}
                  </span>
                  {record.reason && (
                    <span className="audit-reason">
                      {t(`permissions:reasons.${record.reason}`, { defaultValue: record.reason })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
