import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Bidi, I18nProvider, NAMESPACES, Select, Slider, Toggle, useT, type Resources } from '@hermes/ui';
import type { SupportedLanguage } from '@hermes/shared';

const LOCALES = join(__dirname, '..', 'locales');

const resources: Resources = Object.fromEntries(
  (['en', 'ja', 'fa'] as const).map((language) => [
    language,
    Object.fromEntries(NAMESPACES.map((ns) => [ns, JSON.parse(readFileSync(join(LOCALES, language, `${ns}.json`), 'utf8'))])),
  ]),
);

afterEach(cleanup);

function Harness({ initial = 'en' as SupportedLanguage }) {
  const [language, setLanguage] = useState<SupportedLanguage>(initial);
  return (
    <I18nProvider resources={resources} language={language} onLanguageChange={setLanguage}>
      <Body onSwitch={setLanguage} />
    </I18nProvider>
  );
}

function Body({ onSwitch }: { onSwitch: (l: SupportedLanguage) => void }) {
  const t = useT();
  return (
    <div>
      <h1>{t('nav.chat')}</h1>
      <p data-testid="level">{t('permissions:levels.OBSERVE')}</p>
      <p data-testid="interp">{t('chat.placeholder', { values: { name: 'Sakura' } })}</p>
      <p data-testid="stop">{t('emergency.stop')}</p>
      <Bidi as="code">C:\Users\dev\file.txt</Bidi>
      {(['en', 'ja', 'fa'] as const).map((l) => (
        <button key={l} onClick={() => onSwitch(l)}>
          switch-{l}
        </button>
      ))}
    </div>
  );
}

describe('runtime localization', () => {
  it('renders English and sets the document direction to LTR', () => {
    render(<Harness />);
    expect(screen.getByRole('heading').textContent).toBe('Chat');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switches to Japanese at runtime without a reload', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-ja'));
    expect(screen.getByRole('heading').textContent).toBe('チャット');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switches to Persian and flips the document to RTL', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-fa'));
    expect(screen.getByRole('heading').textContent).toBe('گفتگو');
    expect(document.documentElement.lang).toBe('fa');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('switches back from RTL to LTR cleanly', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-fa'));
    expect(document.documentElement.dir).toBe('rtl');
    fireEvent.click(screen.getByText('switch-en'));
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('heading').textContent).toBe('Chat');
  });

  it('translates namespaced keys in every language', () => {
    render(<Harness />);
    expect(screen.getByTestId('level').textContent).toBe('Observe');
    fireEvent.click(screen.getByText('switch-ja'));
    expect(screen.getByTestId('level').textContent).toBe('観察');
    fireEvent.click(screen.getByText('switch-fa'));
    expect(screen.getByTestId('level').textContent).toBe('مشاهده');
  });

  it('interpolates inside translated sentences rather than concatenating', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-fa'));
    const text = screen.getByTestId('interp').textContent ?? '';
    expect(text).toContain('Sakura');
    expect(text).not.toContain('{{');
  });

  it('isolates LTR content inside an RTL document', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-fa'));
    const code = screen.getByText('C:\\Users\\dev\\file.txt');
    expect(code.getAttribute('dir')).toBe('ltr');
    expect(code.style.unicodeBidi).toBe('isolate');
  });

  it('applies a language-specific font stack hook', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('switch-ja'));
    expect(document.documentElement.dataset.lang).toBe('ja');
  });
});

describe('accessible primitives', () => {
  it('slider exposes a label and reports changes', () => {
    let value = 0.5;
    render(
      <I18nProvider resources={resources} language="en">
        <Slider label="Pitch" hint="Raises the voice" value={value} onChange={(v) => (value = v)} />
      </I18nProvider>,
    );
    const slider = screen.getByLabelText('Pitch');
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(value).toBeCloseTo(0.8);
  });

  it('slider shows the unsupported message when disabled by provider capability', () => {
    render(
      <I18nProvider resources={resources} language="en">
        <Slider label="Deepness" hint="Formant shift" unsupportedLabel="Not supported" disabled value={0.3} onChange={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText('Not supported')).toBeTruthy();
    expect((screen.getByLabelText('Deepness') as HTMLInputElement).disabled).toBe(true);
  });

  it('toggle is a real switch with aria-checked', () => {
    let on = false;
    render(
      <I18nProvider resources={resources} language="en">
        <Toggle label="Always on top" checked={on} onChange={(v) => (on = v)} />
      </I18nProvider>,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(on).toBe(true);
  });

  it('select is labelled and emits typed values', () => {
    let picked = 'en';
    render(
      <I18nProvider resources={resources} language="en">
        <Select
          label="Language"
          value={picked}
          onChange={(v) => (picked = v)}
          options={[
            { value: 'en', label: 'English' },
            { value: 'fa', label: 'فارسی' },
          ]}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fa' } });
    expect(picked).toBe('fa');
  });
});
