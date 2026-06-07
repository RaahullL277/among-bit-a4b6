import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Shield, LayoutDashboard, Building2, Users, ScrollText, Sparkles, LogOut, ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { api, BASE_URL } from './api';
import Overview from './pages/Overview';
import Tenants from './pages/Tenants';
import Assistant from './pages/Assistant';
import TenantDetail from './pages/TenantDetail';
import Staff from './pages/Staff';
import Audit from './pages/Audit';

function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(''); // 2FA challenge token
  const [code, setCode] = useState('');

  // A verify response is either a session token or a 2FA challenge.
  const handle = (r) => { if (r?.twoFactorRequired) setChallenge(r.challengeToken); else signIn(r.token); };

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!t) return;
    setLoading(true);
    api.auth.verify(t).then(handle).catch((e) => setError(e.message)).finally(() => {
      setLoading(false);
      window.history.replaceState({}, '', '/');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (challenge) {
        const r = await api.auth.verifyTwoFactor(challenge, code.trim());
        signIn(r.token);
      } else if (!sent) {
        const r = await api.auth.requestLink(email);
        setSent(true);
        if (r.devLink) setToken(new URL(r.devLink).searchParams.get('token') ?? '');
      } else {
        handle(await api.auth.verify(token.trim()));
      }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Shield className="text-indigo-400" size={28} />
          <h1 className="text-lg font-semibold text-white">Platform Console</h1>
          <p className="text-xs text-slate-400">Operator access only.</p>
        </div>
        {challenge ? (
          <>
            <label className="mb-1 block text-xs text-slate-400">Authenticator code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoFocus
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="123456"
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-slate-400">Staff email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="you@company.com"
            />
            {sent && (
              <>
                <label className="mb-1 block text-xs text-slate-400">Login token</label>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="pml_…"
                />
              </>
            )}
          </>
        )}
        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
        <button disabled={loading || (challenge ? code.trim().length < 6 : !email)} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {challenge ? 'Verify code' : sent ? 'Verify & sign in' : 'Send magic link'}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">{BASE_URL}</p>
      </form>
    </div>
  );
}

const nav = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/tenants', label: 'Tenants', icon: Building2 },
  { to: '/assistant', label: 'Assistant', icon: Sparkles },
  { to: '/staff', label: 'Staff', icon: Users, perm: 'platform:staff:manage' },
  { to: '/audit', label: 'Audit log', icon: ScrollText, perm: 'platform:audit:read' },
  { to: '/security', label: 'Security', icon: ShieldCheck },
];

// Self-serve TOTP two-factor for the signed-in operator/partner. Works for both
// consoles (same api.auth shape).
function TwoFactorPanel() {
  const [me, setMe] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => api.auth.me().then(setMe).catch(() => undefined);
  useEffect(() => { load(); }, []);
  const on = me?.auth?.twoFactorEnabled;
  const run = (k, fn) => async () => { setBusy(k); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const begin = run('setup', async () => setSetup(await api.auth.setup2fa()));
  const enable = run('enable', async () => { await api.auth.enable2fa(code.trim()); setSetup(null); setCode(''); load(); });
  const disable = run('disable', async () => { await api.auth.disable2fa(code.trim()); setCode(''); load(); });
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-white">Security</h1>
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-2 text-sm font-medium text-white">Two-factor authentication {on ? <span className="ml-1 rounded bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">on</span> : <span className="text-xs text-slate-400">off</span>}</div>
        {error && <p className="mb-2 text-sm text-rose-400">{error}</p>}
        {!on && !setup && <button onClick={begin} disabled={busy === 'setup'} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Set up 2FA</button>}
        {!on && setup && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Add this secret to your authenticator, then enter the code to enable.</p>
            <div className="break-all rounded bg-slate-900 p-2 font-mono text-xs text-slate-200">{setup.secret}</div>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-white" />
              <button onClick={enable} disabled={busy === 'enable' || code.trim().length < 6} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Enable</button>
            </div>
          </div>
        )}
        {on && (
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Code to disable" className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-white" />
            <button onClick={disable} disabled={busy === 'disable' || code.trim().length < 6} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Disable 2FA</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const { me, signOut, can } = useAuth();
  const items = nav.filter((n) => !n.perm || can(n.perm));
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Shield size={18} className="text-indigo-400" />
          <span className="font-semibold">Platform</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3 text-xs text-slate-400">
          <div className="truncate">{me?.email}</div>
          <div className="mb-2">{me?.role}</div>
          <button onClick={signOut} className="flex items-center gap-2 text-slate-400 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-950 p-8 text-slate-100">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/tenants/:id" element={<TenantDetail />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/security" element={<TwoFactorPanel />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Root() {
  const { isAuthed, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;
  return isAuthed ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
