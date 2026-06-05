import { useEffect, useState } from 'react';
import { ShoppingBag, Mail, KeyRound, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, BASE_URL } from '../api/client';
import { Button, Field, Input, ErrorBanner } from './ui';

const TABS = [
  { id: 'signin', label: 'Sign in', icon: Mail },
  { id: 'signup', label: 'Create workspace', icon: Building2 },
  { id: 'apikey', label: 'API key', icon: KeyRound },
];

export default function LoginGate() {
  const { signInWithToken } = useAuth();
  const [tab, setTab] = useState('signin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign-in (magic link) state.
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [magicToken, setMagicToken] = useState('');

  // Sign-up state.
  const [signup, setSignup] = useState({ email: '', name: '', tenantName: '' });

  // API key state.
  const [apiKey, setApiKey] = useState('');

  const wrap = (fn) => async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-process magic-link / invite tokens from a pasted dev URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    const isInvite = window.location.pathname.includes('invite');
    setLoading(true);
    (isInvite ? api.auth.acceptInvite(token) : api.auth.verify(token))
      .then((res) => signInWithToken(res.token))
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        window.history.replaceState({}, '', '/');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLink = wrap(async () => {
    const res = await api.auth.requestLink(email);
    setLinkSent(true);
    // In dev the API returns a link we can use immediately.
    if (res.devLink) {
      const token = new URL(res.devLink).searchParams.get('token');
      setMagicToken(token ?? '');
    }
  });

  const verify = wrap(async () => {
    const res = await api.auth.verify(magicToken.trim());
    signInWithToken(res.token);
  });

  const doSignup = wrap(async () => {
    const res = await api.auth.signup(signup);
    signInWithToken(res.token);
  });

  const useApiKey = wrap(async () => {
    signInWithToken(apiKey.trim());
  });

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <ShoppingBag size={22} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Merchant Console</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setError('');
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'signin' && (
            <form onSubmit={linkSent ? verify : sendLink} className="space-y-4">
              <Field label="Work email">
                <Input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@store.com"
                />
              </Field>
              {linkSent && (
                <Field label="Login token" hint="From the magic link we emailed you.">
                  <Input value={magicToken} onChange={(e) => setMagicToken(e.target.value)} placeholder="ml_…" />
                </Field>
              )}
              <ErrorBanner message={error} />
              <Button type="submit" loading={loading} className="w-full" disabled={!email.trim()}>
                {linkSent ? 'Verify & sign in' : 'Send magic link'}
              </Button>
              {linkSent && (
                <p className="text-center text-xs text-slate-400">
                  Magic link sent. In dev it's prefilled above.
                </p>
              )}
            </form>
          )}

          {tab === 'signup' && (
            <form onSubmit={doSignup} className="space-y-4">
              <Field label="Workspace name">
                <Input
                  value={signup.tenantName}
                  onChange={(e) => setSignup({ ...signup, tenantName: e.target.value })}
                  placeholder="Acme Retail"
                />
              </Field>
              <Field label="Your email">
                <Input
                  type="email"
                  value={signup.email}
                  onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                />
              </Field>
              <Field label="Your name">
                <Input value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} />
              </Field>
              <ErrorBanner message={error} />
              <Button
                type="submit"
                loading={loading}
                className="w-full"
                disabled={!signup.email.trim() || !signup.tenantName.trim()}
              >
                Create workspace
              </Button>
            </form>
          )}

          {tab === 'apikey' && (
            <form onSubmit={useApiKey} className="space-y-4">
              <Field label="API key" hint="Programmatic access for agents/partners.">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_live_…"
                />
              </Field>
              <ErrorBanner message={error} />
              <Button type="submit" loading={loading} className="w-full" disabled={!apiKey.trim()}>
                Continue
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-slate-400">Connecting to {BASE_URL}</p>
        </div>
      </div>
    </div>
  );
}
