import React, { useEffect, useRef, useState } from 'react';
import { Select, useFormatters, useI18n, useT } from '@hermes/ui';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@hermes/shared';
import { useHermes } from '../state/store.js';

export function ChatPanel() {
  const t = useT();
  const { dir } = useI18n();
  const fmt = useFormatters();
  const messages = useHermes((s) => s.messages);
  const busy = useHermes((s) => s.agentBusy);
  const send = useHermes((s) => s.send);
  const name = useHermes((s) => s.activeCharacter.name);
  const conversationLanguage = useHermes((s) => s.settings.conversation.language);
  const setConversationLanguage = useHermes((s) => s.setConversationLanguage);
  const developerMode = useHermes((s) => s.settings.advanced.developerMode);

  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guarded: not implemented in every embedded webview / test environment,
    // and an autoscroll must never be able to take down the chat panel.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  const visible = messages.filter((m) => developerMode || m.role !== 'system');

  return (
    <div className="panel chat-panel">
      <header className="panel-head">
        <h2>{t('chat.title')}</h2>
        <div className="panel-head-controls">
          <Select
            label={t('chat.conversationLanguage')}
            value={conversationLanguage}
            onChange={(value) => void setConversationLanguage(value as SupportedLanguage)}
            options={SUPPORTED_LANGUAGES.map((lang) => ({
              value: lang,
              label: t(`language.${lang === 'en' ? 'english' : lang === 'ja' ? 'japanese' : 'persian'}`),
            }))}
          />
        </div>
      </header>

      <div className="messages" role="log" aria-live="polite" aria-label={t('chat.title')}>
        {visible.length === 0 && <p className="empty">{t('chat.empty')}</p>}
        {visible.map((message) => (
          <article key={message.id} className={`message message-${message.role}`}>
            <div className="message-meta">
              <span className="message-author">{message.role === 'user' ? t('chat.you') : message.role === 'assistant' ? name : 'debug'}</span>
              <time dateTime={message.at}>{fmt.time(message.at)}</time>
            </div>
            <p>{message.text}</p>
          </article>
        ))}
        {busy && <p className="thinking">{t('chat.thinking', { values: { name } })}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
          setDraft('');
        }}
      >
        <textarea
          value={draft}
          dir={dir}
          rows={2}
          placeholder={t('chat.placeholder', { values: { name } })}
          aria-label={t('chat.placeholder', { values: { name } })}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
              setDraft('');
            }
          }}
        />
        <button type="submit" className="primary" disabled={busy || draft.trim().length === 0}>
          {t('action.send')}
        </button>
      </form>
    </div>
  );
}
