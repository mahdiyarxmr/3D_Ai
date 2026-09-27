import React, { useEffect, useState } from 'react';
import { Bidi, RiskBadge, useT } from '@hermes/ui';
import { useHermes } from '../state/store.js';

/**
 * Blocking confirmation prompt. Rendered as a modal so a tool call can never
 * be approved by accident while the user is doing something else.
 */
export function PermissionDialog() {
  const t = useT();
  const pending = useHermes((s) => s.pendingConfirmation);
  const resolve = useHermes((s) => s.resolveConfirmation);
  const name = useHermes((s) => s.activeCharacter.name);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [pending]);

  if (!pending) return null;

  const toolLabel = t(`tools.${pending.tool}`, { defaultValue: pending.tool });
  const category = pending.detail ? t(`permissions:categories.${pending.detail}`, { defaultValue: pending.detail }) : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="perm-title" aria-describedby="perm-body">
        <header className="modal-head">
          <h2 id="perm-title">{t('permissions:request.title')}</h2>
          <RiskBadge risk={pending.risk} label={t(`permissions:risk.${pending.risk}`)} />
        </header>

        <p id="perm-body">{t('permissions:request.body', { values: { name, tool: toolLabel } })}</p>

        <dl className="modal-details">
          <dt>{t('permissions:request.reasonLabel')}</dt>
          <dd>{category ?? t(`permissions:reasons.${pending.reason}`, { defaultValue: pending.reason })}</dd>
          <dt>{t('permissions:request.argsLabel')}</dt>
          <dd>
            <Bidi as="code">{JSON.stringify(pending.args, null, 2)}</Bidi>
          </dd>
        </dl>

        <p className="countdown">{t('permissions:request.countdown', { values: { seconds: remaining } })}</p>

        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={() => resolve(false)} autoFocus>
            {t('permissions:request.deny')}
          </button>
          <button type="button" className="primary" onClick={() => resolve(true)}>
            {t('permissions:request.approveOnce')}
          </button>
        </footer>
      </div>
    </div>
  );
}
