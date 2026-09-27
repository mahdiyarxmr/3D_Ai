import { useEffect } from 'react';
import { useT } from '@hermes/ui';
import { IS_TAURI, invokeCommand } from '../runtime/platform.js';
import { useHermes } from '../state/store.js';

/**
 * Bridges the native tray to React state. The tray itself is built in Rust
 * (src-tauri/src/tray.rs); this listens for its events and pushes localized
 * labels down whenever the UI language changes, so the tray never drifts out
 * of sync with the rest of the interface.
 */
export function TrayBridge() {
  const t = useT();
  const setMode = useHermes((s) => s.setMode);
  const triggerStop = useHermes((s) => s.triggerEmergencyStop);
  const uiLanguage = useHermes((s) => s.settings.general.uiLanguage);

  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<string>('tray://action', (event) => {
        switch (event.payload) {
          case 'companion':
          case 'show':
            setMode('companion');
            break;
          case 'expanded':
            setMode('expanded');
            break;
          case 'emergency-stop':
            triggerStop();
            break;
        }
      });
    })();
    return () => unlisten?.();
  }, [setMode, triggerStop]);

  useEffect(() => {
    if (!IS_TAURI) return;
    void invokeCommand('tray_set_labels', {
      labels: {
        show: t('tray.show'),
        companion: t('tray.companion'),
        expanded: t('tray.expanded'),
        emergency_stop: t('tray.emergencyStop'),
        quit: t('tray.quit'),
      },
    }).catch(() => undefined);
    // `t` is stable per language; keying on the language keeps this to one
    // rebuild per switch rather than one per render.
  }, [uiLanguage, t]);

  return null;
}
