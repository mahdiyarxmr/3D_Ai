/**
 * Does the application actually start?
 *
 * Every other suite here tests a unit in isolation, and all 174 of them passed
 * while the app rendered a blank white page in a real browser: `defaultCharacter()`
 * built a character with `vrm: ''` but `CharacterSchema` required `.min(1)`, so
 * the store threw during module evaluation and React never mounted.
 *
 * These tests mount the real <App/> the real entrypoint mounts, and assert that
 * a user sees something. They are deliberately coarse — the point is not to
 * check any particular pixel, it is to fail loudly when the product does not run.
 */
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { CharacterSchema, defaultCharacter, defaultSettings } from '@hermes/shared';
import { App } from '../apps/desktop/src/App.js';
import { ErrorBoundary } from '../apps/desktop/src/components/ErrorBoundary.js';

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe('character schema', () => {
  it('allows a character with no VRM imported yet', () => {
    // A fresh install has a character but no model file. If this throws, the
    // store cannot even be constructed and the whole window goes white.
    expect(() => defaultCharacter()).not.toThrow();
    expect(defaultCharacter().vrm).toBe('');
  });

  it('round-trips a character that has no VRM', () => {
    const parsed = CharacterSchema.parse({ id: 'blank', name: 'Blank' });
    expect(parsed.vrm).toBe('');
  });

  it('still accepts a character that does have a VRM', () => {
    const parsed = CharacterSchema.parse({ id: 'sakura', name: 'Sakura', vrm: 'characters/sakura/character.vrm' });
    expect(parsed.vrm).toBe('characters/sakura/character.vrm');
  });

  it('produces valid defaults for settings too', () => {
    expect(() => defaultSettings()).not.toThrow();
  });
});

describe('application boot', () => {
  it('mounts and renders a non-empty UI', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(20));
  });

  it('leaves the boot placeholder and shows the real shell', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.app')).not.toBeNull());
    expect(container.querySelector('.boot')).toBeNull();
  });

  it('renders the primary navigation', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('navigation')).toBeTruthy());
    for (const label of ['Chat', 'Agent', 'Character', 'Voice', 'Settings']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('shows the emergency stop control on first paint', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /emergency stop/i })).toBeTruthy());
  });

  it('does not surface the crash screen', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.app')).not.toBeNull());
    expect(container.querySelector('.crash')).toBeNull();
  });

  it('survives an avatar stage that cannot get a WebGL context', async () => {
    // jsdom has no WebGL, so this is the real code path here: constructing the
    // stage throws, and the app must degrade to a placeholder rather than die.
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.app')).not.toBeNull());
    expect(container.querySelector('.avatar-fallback')).not.toBeNull();
  });
});

describe('error boundary', () => {
  function Boom(): React.ReactElement {
    throw new Error('kaboom-for-test');
  }

  it('renders a readable message instead of a blank page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    // The message and the stack trace both contain it; either is fine.
    expect(screen.getAllByText(/kaboom-for-test/).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });
});
