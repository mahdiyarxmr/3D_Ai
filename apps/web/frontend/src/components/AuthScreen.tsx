import { useState, type FormEvent } from 'react';
import { ApiError, type LunaApiClient, type SessionUser } from '../api';
import { errorMessageKey } from '../i18n';
import { useI18n } from '../i18n-context';

interface Props {
  client: LunaApiClient;
  onAuthenticated: (user: SessionUser, locale: 'en' | 'ja' | 'fa') => void;
}

export function AuthScreen({ client, onAuthenticated }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'login'
          ? await client.login(email, password)
          : await client.register(email, name || email.split('@')[0], password);
      onAuthenticated(user, 'en');
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : 'generic';
      setError(t(errorMessageKey(code)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={submit} aria-labelledby="auth-title">
        <h1 id="auth-title">{t(mode === 'login' ? 'auth.signIn.title' : 'auth.register.title')}</h1>
        <p className="auth__product">{t('app.tagline')}</p>

        {mode === 'register' && (
          <label className="field">
            <span>{t('auth.field.name')}</span>
            <input
              type="text"
              value={name}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
        )}

        <label className="field">
          <span>{t('auth.field.email')}</span>
          <input
            type="email"
            required
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{t('auth.field.password')}</span>
          <input
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            value={password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'register' && <small>{t('auth.password.hint')}</small>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button--primary" disabled={busy}>
          {t(mode === 'login' ? 'auth.signIn.submit' : 'auth.register.submit')}
        </button>

        <button
          type="button"
          className="button button--link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {t(mode === 'login' ? 'auth.register.switch' : 'auth.signIn.switch')}
        </button>

        <p className="auth__notice">{t('notice.noLocalAccess')}</p>
      </form>
    </main>
  );
}
