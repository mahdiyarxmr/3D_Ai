import React, { useCallback, useEffect, useState } from 'react';
import { useT } from '@hermes/ui';
import { AvatarCanvas } from '../components/AvatarCanvas.js';
import { useHermes } from '../state/store.js';
import { IS_TAURI, tauri } from '../runtime/platform.js';

/**
 * Companion mode: a borderless, transparent, always-on-top window where the
 * character occupies almost the entire surface. Chrome appears only on hover.
 */
export function CompanionMode() {
  const t = useT();
  const setMode = useHermes((s) => s.setMode);
  const status = useHermes((s) => s.statusText);
  const busy = useHermes((s) => s.agentBusy);
  const stopped = useHermes((s) => s.emergencyStopped);
  const triggerStop = useHermes((s) => s.triggerEmergencyStop);
  const send = useHermes((s) => s.send);
  const messages = useHermes((s) => s.messages);
  const alwaysOnTop = useHermes((s) => s.settings.general.alwaysOnTop);
  const patchSettings = useHermes((s) => s.patchSettings);

  const [draft, setDraft] = useState('');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  // Dragging: Tauri moves the OS window; in the browser we move the element so
  // the interaction is still demonstrable.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const onDragStart = useCallback(
    async (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).closest('button, input, textarea')) return;
      if (IS_TAURI) {
        const mod = await tauri(() => import('@tauri-apps/api/window'));
        await mod?.getCurrentWindow().startDragging();
        return;
      }
      const startX = event.clientX - offset.x;
      const startY = event.clientY - offset.y;
      const move = (e: PointerEvent) => setOffset({ x: e.clientX - startX, y: e.clientY - startY });
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [offset],
  );

  useEffect(() => {
    if (!IS_TAURI) return;
    void (async () => {
      const mod = await tauri(() => import('@tauri-apps/api/window'));
      await mod?.getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
    })();
  }, [alwaysOnTop]);

  return (
    <div className="companion" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onPointerDown={onDragStart}>
      <div className="companion-stage">
        <AvatarCanvas className="avatar-canvas companion-avatar" />
        {lastAssistant && (
          <div className="speech-bubble" role="status" aria-live="polite">
            {lastAssistant.text}
          </div>
        )}
      </div>

      <div className="companion-chrome">
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span className="companion-status">{t(`status.${status}`)}</span>
        <div className="companion-actions">
          <button
            type="button"
            className="ghost"
            aria-pressed={alwaysOnTop}
            title={t('settings:general.alwaysOnTop')}
            onClick={() => void patchSettings({ general: { alwaysOnTop: !alwaysOnTop } })}
          >
            {alwaysOnTop ? '📌' : '📍'}
          </button>
          <button type="button" className="ghost" title={t('mode.toExpanded')} onClick={() => setMode('expanded')}>
            ⤢
          </button>
          <button
            type="button"
            className={`danger-pill${stopped ? ' is-engaged' : ''}`}
            title={t('emergency.hint')}
            onClick={triggerStop}
          >
            {t('emergency.stopShort')}
          </button>
        </div>
      </div>

      <form
        className="companion-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
          setDraft('');
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat.placeholder', { values: { name: 'HERMES' } })}
          aria-label={t('chat.title')}
          disabled={busy}
        />
      </form>
    </div>
  );
}
