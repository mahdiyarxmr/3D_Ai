import { useEffect, useState } from 'react';
import type { Conversation } from '../api';
import { useI18n } from '../i18n-context';

interface Props {
  conversations: Conversation[];
  activeId: number | null;
  searchResults: Array<{ id: number; title: string; snippet: string }> | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  userLabel: string;
  onSignOut: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  searchResults,
  onSelect,
  onNew,
  onDelete,
  onSearch,
  onOpenSettings,
  userLabel,
  onSignOut,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(handle);
  }, [query, onSearch]);

  const items = searchResults
    ? searchResults.map((result) => ({ id: result.id, title: result.title, subtitle: result.snippet }))
    : conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title || t('chat.newConversation'),
        subtitle: t('conversations.messageCount', { count: conversation.message_count ?? 0 }),
      }));

  return (
    <aside className="sidebar" aria-label={t('conversations.title')}>
      <div className="sidebar__header">
        <strong>{t('app.name')}</strong>
        <button type="button" className="button button--ghost" onClick={onOpenSettings}>
          {t('nav.settings')}
        </button>
      </div>

      <button type="button" className="button button--primary sidebar__new" onClick={onNew}>
        {t('chat.newConversation')}
      </button>

      <label className="field field--compact">
        <span className="visually-hidden">{t('conversations.search')}</span>
        <input
          type="search"
          placeholder={t('conversations.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <nav className="sidebar__list">
        {items.length === 0 && <p className="muted">{searchResults ? t('conversations.searchEmpty') : t('state.empty')}</p>}
        {items.map((item) => (
          <div key={item.id} className={`conversation ${item.id === activeId ? 'conversation--active' : ''}`}>
            <button type="button" className="conversation__open" onClick={() => onSelect(item.id)}>
              <span className="conversation__title">{item.title}</span>
              <span className="conversation__subtitle">{item.subtitle}</span>
            </button>
            <button
              type="button"
              className="button button--icon"
              aria-label={`${t('action.delete')}: ${item.title}`}
              onClick={() => {
                if (window.confirm(t('conversations.delete.confirm'))) onDelete(item.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </nav>

      <footer className="sidebar__footer">
        <span className="muted">{userLabel}</span>
        <button type="button" className="button button--ghost" onClick={onSignOut}>
          {t('action.signOut')}
        </button>
      </footer>
    </aside>
  );
}
