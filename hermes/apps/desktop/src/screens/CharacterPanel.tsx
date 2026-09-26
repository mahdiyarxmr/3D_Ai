import React, { useRef, useState } from 'react';
import { Select, Slider, useT } from '@hermes/ui';
import { validateVrm, type VrmValidationError } from '@hermes/vrm';
import { CharacterSchema, type Character } from '@hermes/shared';
import { useHermes } from '../state/store.js';
import { storage } from '../runtime/storage.js';
import { AvatarCanvas } from '../components/AvatarCanvas.js';

/**
 * Character import.
 *
 * Flow: pick file -> validate the container -> persist bytes -> persist the
 * character record -> the shared stage reloads. An invalid file surfaces a
 * localized error and leaves the current character untouched.
 */
export function CharacterPanel() {
  const t = useT();
  const character = useHermes((s) => s.activeCharacter);
  const characters = useHermes((s) => s.characters);
  const saveCharacter = useHermes((s) => s.saveCharacter);
  const setActiveCharacter = useHermes((s) => s.setActiveCharacter);
  const vrmLoaded = useHermes((s) => s.vrmLoaded);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<VrmValidationError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const bytes = await file.arrayBuffer();
      const validation = validateVrm(bytes);
      if (!validation.ok) {
        setError(validation.error ?? 'bad_json');
        return;
      }

      const id = slugify(validation.meta?.name || file.name.replace(/\.vrm$/i, '')) || `character-${Date.now().toString(36)}`;
      await storage.saveVrm(id, bytes);

      const next: Character = CharacterSchema.parse({
        ...character,
        id,
        name: validation.meta?.name?.trim() || file.name.replace(/\.vrm$/i, ''),
        vrm: `characters/${id}/character.vrm`,
        createdAt: character.createdAt ?? new Date().toISOString(),
      });
      await saveCharacter(next);
      setNotice(t('character.imported', { values: { name: next.name } }));
    } finally {
      setBusy(false);
    }
  }

  function patch(partial: Partial<Character>) {
    void saveCharacter(CharacterSchema.parse({ ...character, ...partial }));
  }

  return (
    <div className="panel character-panel">
      <header className="panel-head">
        <h2>{t('character.title')}</h2>
      </header>

      <div className="character-grid">
        <div className="character-preview">
          <AvatarCanvas className="avatar-canvas preview-avatar" interactive={false} />
          {!vrmLoaded && <p className="notice">{t('character.fallbackNotice')}</p>}
        </div>

        <div className="character-controls">
          <section className="card">
            <h3>{t('character.active')}</h3>
            {characters.length > 0 && (
              <Select
                label={t('character.active')}
                value={character.id}
                onChange={(value) => void setActiveCharacter(value)}
                options={characters.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".vrm,model/gltf-binary,application/octet-stream"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            <button type="button" className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? t('character.importing') : vrmLoaded ? t('character.replace') : t('character.import')}
            </button>

            {error && (
              <p className="error" role="alert">
                {t(`character.errors.${error}`)}
              </p>
            )}
            {notice && <p className="notice success">{notice}</p>}

            <label className="field">
              <span>{t('character.title')}</span>
              <input
                type="text"
                value={character.name}
                onChange={(event) => patch({ name: event.target.value.slice(0, 64) })}
              />
            </label>
          </section>

          <section className="card">
            <h3>{t('character.title')}</h3>
            <Slider
              label={t('character.scale')}
              value={character.transform.scale}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(value) => patch({ transform: { ...character.transform, scale: value } })}
            />
            <Slider
              label={t('character.offsetX')}
              value={character.transform.offsetX}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => patch({ transform: { ...character.transform, offsetX: value } })}
            />
            <Slider
              label={t('character.offsetY')}
              value={character.transform.offsetY}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => patch({ transform: { ...character.transform, offsetY: value } })}
            />
          </section>

          <section className="card">
            <h3>{t('voice:personality.title')}</h3>
            {(['cute', 'playful', 'confident', 'verbose', 'warmth', 'initiative'] as const).map((trait) => (
              <Slider
                key={trait}
                label={t(`voice:personality.${trait}`)}
                hint={t(`voice:personality.${trait}Hint`)}
                value={character.personality[trait]}
                onChange={(value) => patch({ personality: { ...character.personality, [trait]: value } })}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
