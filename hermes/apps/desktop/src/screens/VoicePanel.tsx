import React, { useState } from 'react';
import { Select, Slider, Toggle, useT } from '@hermes/ui';
import { CharacterSchema, type VoiceParams } from '@hermes/shared';
import { useHermes } from '../state/store.js';

/**
 * Voice parameters are character data, not UI state: they are persisted on the
 * character and sent to the voice service, which reports back which ones the
 * active provider can honour. Unsupported parameters are disabled rather than
 * silently ignored.
 */
const UNIT_PARAMS = [
  'pitch',
  'energy',
  'softness',
  'warmth',
  'deepness',
  'maturity',
  'cuteness',
  'expressiveness',
  'japaneseInfluence',
  'animeStyle',
] as const;

/** TODO: replace with a live capability query to services/voice. */
const MOCK_PROVIDER_CAPABILITIES = new Set<keyof VoiceParams>([
  'pitch',
  'speed',
  'energy',
  'expressiveness',
  'cuteness',
  'baseVoice',
  'gender',
]);

export function VoicePanel() {
  const t = useT();
  const character = useHermes((s) => s.activeCharacter);
  const saveCharacter = useHermes((s) => s.saveCharacter);
  const settings = useHermes((s) => s.settings);
  const patchSettings = useHermes((s) => s.patchSettings);
  const [previewing, setPreviewing] = useState(false);

  const voice = character.voice;

  function patchVoice(partial: Partial<VoiceParams>) {
    void saveCharacter(CharacterSchema.parse({ ...character, voice: { ...voice, ...partial } }));
  }

  function supported(key: keyof VoiceParams): boolean {
    return MOCK_PROVIDER_CAPABILITIES.has(key);
  }

  async function preview() {
    setPreviewing(true);
    try {
      // TODO: call services/voice POST /voice/preview once a TTS provider is
      // configured. The browser build falls back to the Web Speech API so the
      // control is genuinely functional rather than decorative.
      const utteranceText = t('voice:preview.sample', { values: { name: character.name } });
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(utteranceText);
        utterance.rate = voice.speed;
        utterance.pitch = 0.5 + voice.pitch * 1.5;
        utterance.lang = settings.conversation.language === 'ja' ? 'ja-JP' : settings.conversation.language === 'fa' ? 'fa-IR' : 'en-GB';
        await new Promise<void>((resolve) => {
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      }
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="panel voice-panel">
      <header className="panel-head">
        <h2>{t('voice:title')}</h2>
        <button type="button" className="primary" onClick={() => void preview()} disabled={previewing}>
          {previewing ? t('voice:preview.playing') : t('voice:preview.button')}
        </button>
      </header>

      <div className="voice-grid">
        <section className="card">
          <h3>{t('voice:profile')}</h3>
          <Select
            label={t('voice:gender.label')}
            value={voice.gender}
            onChange={(value) => patchVoice({ gender: value as VoiceParams['gender'] })}
            options={[
              { value: 'feminine', label: t('voice:gender.feminine') },
              { value: 'masculine', label: t('voice:gender.masculine') },
              { value: 'neutral', label: t('voice:gender.neutral') },
            ]}
          />
          <Select
            label={t('voice:baseVoice')}
            value={voice.baseVoice}
            onChange={(value) => patchVoice({ baseVoice: value })}
            options={['voice_01', 'voice_02', 'voice_03', 'voice_04'].map((v) => ({ value: v, label: v }))}
          />
          <Slider
            label={t('voice:params.speed')}
            hint={t('voice:params.speedHint')}
            value={voice.speed}
            min={0.5}
            max={2}
            step={0.01}
            disabled={!supported('speed')}
            unsupportedLabel={t('voice:unsupported')}
            onChange={(value) => patchVoice({ speed: value })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </section>

        <section className="card">
          <h3>{t('voice:title')}</h3>
          {UNIT_PARAMS.map((key) => (
            <Slider
              key={key}
              label={t(`voice:params.${key}`)}
              hint={t(`voice:params.${key}Hint`)}
              value={voice[key]}
              disabled={!supported(key)}
              unsupportedLabel={t('voice:unsupported')}
              onChange={(value) => patchVoice({ [key]: value } as Partial<VoiceParams>)}
            />
          ))}
        </section>

        <section className="card">
          <h3>{t('voice:input.title')}</h3>
          <Toggle
            label={t('voice:input.enable')}
            checked={settings.voice.inputEnabled}
            onChange={(checked) => void patchSettings({ voice: { inputEnabled: checked } })}
          />
          <Slider
            label={t('voice:input.vadThreshold')}
            value={settings.voice.vadThreshold}
            onChange={(value) => void patchSettings({ voice: { vadThreshold: value } })}
          />
          <h3>{t('voice:output.title')}</h3>
          <Toggle
            label={t('voice:output.enable')}
            checked={settings.voice.outputEnabled}
            onChange={(checked) => void patchSettings({ voice: { outputEnabled: checked } })}
          />
        </section>
      </div>
    </div>
  );
}
