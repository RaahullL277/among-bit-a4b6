import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Users, LayoutDashboard, Building2, CalendarClock, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { api, BASE_URL } from './api';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Renewals from './pages/Renewals';

function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!t) return;
    setLoading(true);
    api.auth.verify(t).then((r) => signIn(r.token)).catch((e) => setError(e.message)).finally(() => {
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
      if (!sent) {
        const r = await api.auth.requestLink(email);
        setSent(true);
        if (r.devLink) setToken(new URL(r.devLink).searchParams.get('token') ?? '');
      } else {
        const r = await api.auth.verify(token.trim());
        signIn(r.token);
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
          <Users className="text-indigo-400" size={28} />
          <h1 className="text-lg font-semibold text-white">Partner Portal</h1>
          <p className="text-xs text-slate-400">Agency &amp; reseller access.</p>
        </div>
        <label className="mb-1 block text-xs text-slate-400">Partner email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
          placeholder="you@agency.com"
        />
        {sent && (
          <>
            <label className="mb-1 block text-xs text-slate-400">Login token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="ptml_…"
            />
          </>
        )}
        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
        <button disabled={loading || !email} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {sent ? 'Verify & sign in' : 'Send magic link'}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">{BASE_URL}</p>
      </form>
    </div>
  );
}

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/renewals', label: 'Renewals', icon: CalendarClock },
];

function Shell() {
  const { me, signOut } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Users size={18} className="text-indigo-400" />
          <span className="font-semibold">Partner</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map(({ to, label, icon: Icon }) => (
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
          <div className="truncate">{me?.name}</div>
          <div className="mb-2 truncate">{me?.email}</div>
          <button onClick={signOut} className="flex items-center gap-2 text-slate-400 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-950 p-8 text-slate-100">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/renewals" element={<Renewals />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
