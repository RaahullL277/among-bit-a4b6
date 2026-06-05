import { createContext, useContext, useMemo, useState } from 'react';
import { getApiKey, setApiKey as persistKey, api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [apiKey, setKeyState] = useState(getApiKey());

  const value = useMemo(
    () => ({
      apiKey,
      isAuthed: Boolean(apiKey),
      // Validate the key against the API before persisting it.
      async signIn(key) {
        persistKey(key);
        try {
          await api.validateKey();
          setKeyState(key);
        } catch (err) {
          persistKey('');
          throw err;
        }
      },
      signOut() {
        persistKey('');
        setKeyState('');
      },
    }),
    [apiKey],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
