import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, LunaApiClient } from '../api';
import { ApiError } from '../api';
import { errorMessageKey } from '../i18n';
import { useI18n } from '../i18n-context';

interface Props {
  client: LunaApiClient;
  conversationId: number | null;
  messages: ChatMessage[];
  providerIsDevelopment: boolean;
  onMessagesChange: (messages: ChatMessage[]) => void;
}

export function ChatView({ client, conversationId, messages, providerIsDevelopment, onMessagesChange }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolNotice, setToolNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingText]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || conversationId === null || streaming) return;

    const optimistic: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    onMessagesChange([...messages, optimistic]);
    setDraft('');
    setStreaming(true);
    setStreamingText('');
    setError(null);
    setToolNotice(null);

    const controller = new AbortController();
    controllerRef.current = controller;
    let accumulated = '';

    try {
      await client.streamMessage(
        conversationId,
        content,
        {
          onDelta: (text) => {
            accumulated += text;
            setStreamingText(accumulated);
          },
          onTool: (tool) => {
            setToolNotice(
              tool.status === 'denied'
                ? t('chat.tool.denied', { name: tool.name })
                : t('chat.tool.used', { name: tool.name })
            );
          },
          onError: (code) => setError(t(errorMessageKey(code))),
        },
        controller.signal
      );
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        const code = caught instanceof ApiError ? caught.code : 'generic';
        setError(t(errorMessageKey(code)));
      }
    } finally {
      controllerRef.current = null;
      setStreaming(false);
      if (accumulated) {
        onMessagesChange([
          ...messages,
          optimistic,
          { id: Date.now() + 1, role: 'assistant', content: accumulated, created_at: new Date().toISOString() },
        ]);
      }
      setStreamingText('');
    }
  };

  return (
    <section className="chat" aria-label={t('nav.chat')}>
      {providerIsDevelopment && <p className="banner">{t('notice.devProvider')}</p>}

      <div className="chat__messages" role="log" aria-live="polite">
        {conversationId === null && <p className="muted">{t('chat.newConversation')}</p>}
        {conversationId !== null && messages.length === 0 && !streaming && <p className="muted">{t('state.empty')}</p>}

        {messages.map((message) => (
          <article key={message.id} className={`message message--${message.role}`}>
            <div className="message__body">{message.content}</div>
            {message.role === 'assistant' && (
              <button
                type="button"
                className="button button--ghost message__action"
                onClick={() => navigator.clipboard?.writeText(message.content)}
              >
                {t('chat.copy')}
              </button>
            )}
          </article>
        ))}

        {streaming && (
          <article className="message message--assistant">
            <div className="message__body">{streamingText || t('chat.thinking')}</div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>

      {toolNotice && <p className="banner banner--muted">{toolNotice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <form className="composer" onSubmit={send}>
        <label className="visually-hidden" htmlFor="composer-input">
          {t('chat.placeholder')}
        </label>
        <textarea
          id="composer-input"
          value={draft}
          rows={1}
          maxLength={32000}
          placeholder={t('chat.placeholder')}
          disabled={conversationId === null || streaming}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(event as unknown as FormEvent);
            }
          }}
        />
        {streaming ? (
          <button type="button" className="button button--danger" onClick={() => controllerRef.current?.abort()}>
            {t('chat.stopStreaming')}
          </button>
        ) : (
          <button type="submit" className="button button--primary" disabled={conversationId === null || !draft.trim()}>
            {t('chat.send')}
          </button>
        )}
      </form>
    </section>
  );
}
