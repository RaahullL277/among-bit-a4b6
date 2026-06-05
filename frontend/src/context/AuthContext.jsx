import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, setToken as persistToken, api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

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
      // Persist a freshly issued token (session or API key) and trigger /me load.
      signInWithToken(newToken) {
        persistToken(newToken);
        setTokenState(newToken);
      },
      async signOut() {
        const current = token;
        persistToken('');
        setTokenState('');
        setMe(null);
        if (current?.startsWith('ses_')) await api.auth.logout(current).catch(() => undefined);
      },
    }),
    [token, me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
