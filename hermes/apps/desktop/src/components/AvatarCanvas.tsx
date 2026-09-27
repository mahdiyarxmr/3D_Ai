import React, { useEffect, useRef, useState } from 'react';
import { VrmStage } from '@hermes/vrm';
import { useHermes } from '../state/store.js';
import { storage } from '../runtime/storage.js';

/**
 * Hosts the WebGL stage. Mounted once and shared by both window modes so the
 * idle animation keeps running when the user switches views.
 */
export function AvatarCanvas({ interactive = true, className }: { interactive?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<VrmStage | null>(null);
  const character = useHermes((s) => s.activeCharacter);
  const emotion = useHermes((s) => s.emotion);
  const setVrmLoaded = useHermes((s) => s.setVrmLoaded);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    // WebGL is unavailable on some VMs, over remote desktop, and under GPU
    // driver blocklists. Losing the avatar is acceptable; losing the entire
    // application because a renderer could not be constructed is not.
    let stage: VrmStage;
    try {
      stage = new VrmStage({ canvas: canvasRef.current, transparent: true });
      stage.start();
    } catch (error) {
      console.error('[hermes] WebGL unavailable; avatar disabled', error);
      setWebglFailed(true);
      return;
    }
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  // Load the active character's VRM whenever it changes.
  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;
    if (!stage) return;
    if (!character.vrm) {
      stage.resetToFallback();
      setVrmLoaded(false);
      return;
    }
    void (async () => {
      const bytes = await storage.loadVrm(character.id);
      if (cancelled || !bytes) return;
      const result = await stage.loadVrm(bytes);
      if (!cancelled) setVrmLoaded(result.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [character.id, character.vrm, setVrmLoaded]);

  useEffect(() => {
    stageRef.current?.setTransform(character.transform.scale, character.transform.offsetX, character.transform.offsetY);
  }, [character.transform.scale, character.transform.offsetX, character.transform.offsetY]);

  useEffect(() => {
    stageRef.current?.setEmotion(emotion === 'neutral' ? null : emotion, 0.85);
  }, [emotion]);

  // Gaze follows the pointer — cheap, and makes the character feel alive.
  useEffect(() => {
    if (!interactive) return;
    const onMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -((event.clientY / window.innerHeight) * 2 - 1);
      stageRef.current?.setLookAt(x * 0.5, y * 0.4);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [interactive]);

  if (webglFailed) {
    return (
      <div className={`${className ?? 'avatar-canvas'} avatar-fallback`} role="img" aria-label={character.name}>
        <span>{character.name.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return <canvas ref={canvasRef} className={className ?? 'avatar-canvas'} aria-hidden="true" />;
}

