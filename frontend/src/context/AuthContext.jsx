import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, setToken as persistToken, getActingClient, setActingClient, api } from '../api/client';

const AuthContext = createContext(null);

// A partner deep-linking from the portal arrives with ?partnerToken&client&clientName.
// Adopt those credentials (partner token + acting client) before first render.
function adoptPartnerHandoff() {
  const params = new URLSearchParams(window.location.search);
  const partnerToken = params.get('partnerToken');
  const client = params.get('client');
  if (partnerToken && client) {
    persistToken(partnerToken);
    setActingClient({ tenantId: client, name: params.get('clientName') ?? 'Client store' });
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }
  return false;
}

export function AuthProvider({ children }) {
  // Adopt a partner handoff (if any) before reading the stored token.
  const [token, setTokenState] = useState(() => {
    adoptPartnerHandoff();
    return getToken();
  });
  const [actingClient, setActingClientState] = useState(getActingClient());
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // Validate the stored token by loading the current identity.
  useEffect(() => {
    let active = true;
    if (!token) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.auth
      .me()
      .then((data) => active && setMe(data))
      .catch(() => {
        if (!active) return;
        persistToken('');
        setTokenState('');
        setMe(null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      me,
      loading,
      isAuthed: Boolean(token),
      role: me?.role,
      permissions: me?.permissions ?? [],
      can: (perm) => (me?.permissions ?? []).includes(perm),
      // The client store a partner is currently managing (null for normal users).
      actingClient: me?.actor === 'partner' ? actingClient : null,
      // Persist a freshly issued token (session or API key) and trigger /me load.
      signInWithToken(newToken) {
        persistToken(newToken);
        setTokenState(newToken);
      },
      async signOut() {
        const current = token;
        persistToken('');
        setTokenState('');
        setActingClient(null);
        setActingClientState(null);
        setMe(null);
        if (current?.startsWith('ses_')) await api.auth.logout(current).catch(() => undefined);
      },
    }),
    [token, me, loading, actingClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
