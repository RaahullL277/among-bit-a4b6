import { useState } from 'react';
import { ShoppingBag, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, ErrorBanner } from './ui';
import { BASE_URL } from '../api/client';

/** Sign-in screen: the merchant pastes an API key, validated against the API. */
export default function ApiKeyGate() {
  const { signIn } = useAuth();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(key.trim());
    } catch (err) {
      setError(err.status === 401 ? 'That API key was not accepted.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <ShoppingBag size={22} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Merchant Console</h1>
          <p className="text-sm text-slate-500">Sign in with your store API key to continue.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="API key" hint="Created via the seed script or POST /api-keys.">
            <Input
              type="password"
              autoFocus
              placeholder="sk_live_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <ErrorBanner message={error} />
          <Button type="submit" loading={loading} className="w-full" disabled={!key.trim()}>
            <KeyRound size={15} /> Sign in
          </Button>
          <p className="text-center text-xs text-slate-400">Connecting to {BASE_URL}</p>
        </form>
      </div>
    </div>
  );
}
