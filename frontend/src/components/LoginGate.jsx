import { useEffect, useState } from 'react';
import { ShoppingBag, Mail, KeyRound, Building2, Smartphone, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, BASE_URL } from '../api/client';
import { Button, Field, Input, ErrorBanner } from './ui';

const TABS = [
  { id: 'signin', label: 'Sign in', icon: Mail },
  { id: 'phone', label: 'Phone', icon: Smartphone },
  { id: 'signup', label: 'Create', icon: Building2 },
  { id: 'apikey', label: 'API key', icon: KeyRound },
];

export default function LoginGate() {
  const { signInWithToken } = useAuth();
  const [tab, setTab] = useState('signin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sign-in (email + password / magic link).
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [magicToken, setMagicToken] = useState('');

  // Phone OTP.
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  // Sign-up.
  const [signup, setSignup] = useState({ email: '', name: '', tenantName: '', password: '' });

  // API key.
  const [apiKey, setApiKey] = useState('');

  // 2FA challenge (set when a login returns twoFactorRequired).
  const [challenge, setChallenge] = useState(''); // challengeToken
  const [twoFaCode, setTwoFaCode] = useState('');

  const wrap = (fn) => async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try { await fn(); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  // Resolve a login response: a session token, or a 2FA challenge.
  const handleOutcome = (res) => {
    if (res?.twoFactorRequired) setChallenge(res.challengeToken);
    else if (res?.token) signInWithToken(res.token);
    else throw new Error('Unexpected response.');
  };

  // Auto-process magic-link / invite tokens from a pasted dev URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    const isInvite = window.location.pathname.includes('invite');
    setLoading(true);
    (isInvite ? api.auth.acceptInvite(token) : api.auth.verify(token))
      .then(handleOutcome)
      .catch((err) => setError(err.message))
      .finally(() => { setLoading(false); window.history.replaceState({}, '', '/'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInPassword = wrap(async () => handleOutcome(await api.auth.login({ email: email.trim(), password })));
  const sendLink = wrap(async () => {
    const res = await api.auth.requestLink(email.trim());
    setLinkSent(true);
    if (res.devLink) setMagicToken(new URL(res.devLink).searchParams.get('token') ?? '');
  });
  const verifyLink = wrap(async () => handleOutcome(await api.auth.verify(magicToken.trim())));

  const sendOtp = wrap(async () => {
    const res = await api.auth.requestPhoneOtp(phone.trim());
    setOtpSent(true);
    if (res.devCode) setOtp(res.devCode);
  });
  const verifyOtp = wrap(async () => handleOutcome(await api.auth.verifyPhoneOtp({ phone: phone.trim(), code: otp.trim() })));

  const doSignup = wrap(async () => {
    const res = signup.password
      ? await api.auth.register(signup)
      : await api.auth.signup({ email: signup.email, name: signup.name, tenantName: signup.tenantName });
    handleOutcome(res);
  });

  const useApiKey = wrap(async () => signInWithToken(apiKey.trim()));
  const submitTwoFa = wrap(async () => {
    const res = await api.auth.verifyTwoFactor(challenge, twoFaCode.trim());
    signInWithToken(res.token);
  });

  // 2FA step takes over the form once a challenge is issued.
  if (challenge) {
    return (
      <Shell>
        <form onSubmit={submitTwoFa} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><ShieldCheck size={16} /> Two-factor verification</div>
          <Field label="Authenticator code" hint="6-digit code from your authenticator app.">
            <Input autoFocus inputMode="numeric" value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} placeholder="123456" />
          </Field>
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={twoFaCode.trim().length < 6}>Verify</Button>
          <button type="button" onClick={() => { setChallenge(''); setTwoFaCode(''); }} className="w-full text-center text-xs text-slate-400">Back to sign in</button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(''); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'signin' && (
        <form onSubmit={signInPassword} className="space-y-4">
          <Field label="Work email"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={!email.trim() || !password}>Sign in</Button>
          <div className="border-t border-slate-100 pt-3">
            {!linkSent ? (
              <button type="button" onClick={sendLink} disabled={!email.trim()} className="w-full text-center text-xs text-indigo-600 disabled:opacity-50">Email me a magic link instead</button>
            ) : (
              <div className="space-y-2">
                <Field label="Login token" hint="From the magic link we emailed you.">
                  <Input value={magicToken} onChange={(e) => setMagicToken(e.target.value)} placeholder="ml_…" />
                </Field>
                <Button type="button" variant="secondary" onClick={verifyLink} loading={loading} className="w-full" disabled={!magicToken.trim()}>Verify magic link</Button>
              </div>
            )}
          </div>
        </form>
      )}

      {tab === 'phone' && (
        <form onSubmit={otpSent ? verifyOtp : sendOtp} className="space-y-4">
          <Field label="Phone number" hint="E.164, e.g. +919812345678"><Input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9198…" /></Field>
          {otpSent && (
            <Field label="One-time code" hint="Sent by SMS (prefilled in dev)."><Input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" /></Field>
          )}
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={!phone.trim() || (otpSent && otp.trim().length < 6)}>
            {otpSent ? 'Verify & sign in' : 'Send code'}
          </Button>
        </form>
      )}

      {tab === 'signup' && (
        <form onSubmit={doSignup} className="space-y-4">
          <Field label="Workspace name"><Input value={signup.tenantName} onChange={(e) => setSignup({ ...signup, tenantName: e.target.value })} placeholder="Acme Retail" /></Field>
          <Field label="Your email"><Input type="email" value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} /></Field>
          <Field label="Your name"><Input value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} /></Field>
          <Field label="Password" hint="Optional — leave blank to use magic-link sign-in."><Input type="password" value={signup.password} onChange={(e) => setSignup({ ...signup, password: e.target.value })} placeholder="min 8 characters" /></Field>
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={!signup.email.trim() || !signup.tenantName.trim()}>Create workspace</Button>
        </form>
      )}

      {tab === 'apikey' && (
        <form onSubmit={useApiKey} className="space-y-4">
          <Field label="API key" hint="Programmatic access for agents/partners."><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_live_…" /></Field>
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={!apiKey.trim()}>Continue</Button>
        </form>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">Connecting to {BASE_URL}</p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white"><ShoppingBag size={22} /></div>
          <h1 className="text-xl font-semibold text-slate-900">Merchant Console</h1>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
