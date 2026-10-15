import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  LunaApiClient,
  type ChatMessage,
  type Conversation,
  type HealthInfo,
  type SessionUser,
  type UserSettings,
} from './api';
import { errorMessageKey, type Locale } from './i18n';
import { useI18n } from './i18n-context';
import { AuthScreen } from './components/AuthScreen';
import { ChatView } from './components/ChatView';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';

export function App({ client = new LunaApiClient() }: { client?: LunaApiClient }) {
  const { t, setLocale } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [settings, setSettings] = useState<UserSettings>({ language: 'en', theme: 'system' });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ id: number; title: string; snippet: string }> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    const response = await client.listConversations();
    setConversations(response.conversations);
    return response.conversations;
  }, [client]);

  const openConversation = useCallback(
    async (id: number) => {
      const response = await client.getConversation(id);
      setActiveId(id);
      setMessages(response.messages);
      setSearchResults(null);
    },
    [client]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await client.health();
        if (!cancelled) setHealth(info);
      } catch {
        if (!cancelled) setHealth(null);
      }

      try {
        const { user: current } = await client.me();
        if (cancelled) return;
        setUser(current);
        const [settingsResponse, list] = await Promise.all([client.getSettings(), client.listConversations()]);
        if (cancelled) return;
        setSettings(settingsResponse.settings);
        setLocale(settingsResponse.settings.language as Locale);
        setConversations(list.conversations);
        if (list.conversations.length > 0) await openConversation(list.conversations[0].id);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && error.status !== 401 && error.status !== 0) {
          setFatal(t(errorMessageKey(error.code)));
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, openConversation, setLocale, t]);

  const onAuthenticated = useCallback(
    async (authenticated: SessionUser) => {
      setUser(authenticated);
      const [settingsResponse, list] = await Promise.all([client.getSettings(), client.listConversations()]);
      setSettings(settingsResponse.settings);
      setLocale(settingsResponse.settings.language as Locale);
      setConversations(list.conversations);
      if (list.conversations.length > 0) await openConversation(list.conversations[0].id);
      else {
        const created = await client.createConversation();
        setConversations([created.conversation]);
        await openConversation(created.conversation.id);
      }
    },
    [client, openConversation, setLocale]
  );

  const startNewConversation = useCallback(async () => {
    const created = await client.createConversation();
    setConversations((current) => [created.conversation, ...current]);
    await openConversation(created.conversation.id);
    setMessages([]);
  }, [client, openConversation]);

  const deleteConversation = useCallback(
    async (id: number) => {
      await client.deleteConversation(id);
      const remaining = conversations.filter((conversation) => conversation.id !== id);
      setConversations(remaining);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        if (remaining.length > 0) await openConversation(remaining[0].id);
      }
    },
    [activeId, client, conversations, openConversation]
  );

  const search = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setSearchResults(null);
        return;
      }
      try {
        const response = await client.searchConversations(query.trim());
        setSearchResults(response.results);
      } catch {
        setSearchResults(null);
      }
    },
    [client]
  );

  const themeClass = useMemo(() => `theme-${settings.theme}`, [settings.theme]);

  if (booting) {
    return <p className="boot">{t('state.loading')}</p>;
  }

  if (!user) {
    return (
      <div className={themeClass}>
        <AuthScreen client={client} onAuthenticated={(authenticated) => void onAuthenticated(authenticated)} />
      </div>
    );
  }

  return (
    <div className={`app ${themeClass}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        searchResults={searchResults}
        userLabel={user.name}
        onSelect={(id) => void openConversation(id)}
        onNew={() => void startNewConversation()}
        onDelete={(id) => void deleteConversation(id)}
        onSearch={(query) => void search(query)}
        onOpenSettings={() => setShowSettings(true)}
        onSignOut={() => {
          client.logout();
          setUser(null);
          setConversations([]);
          setMessages([]);
          setActiveId(null);
        }}
      />

      <ChatView
        client={client}
        conversationId={activeId}
        messages={messages}
        providerIsDevelopment={health?.provider === 'echo'}
        onMessagesChange={(next) => {
          setMessages(next);
          void loadConversations();
        }}
      />

      {fatal && (
        <p className="error" role="alert">
          {fatal}
        </p>
      )}

      {showSettings && (
        <SettingsPanel
          client={client}
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
