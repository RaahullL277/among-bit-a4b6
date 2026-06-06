import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTok] = useState(getToken());
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

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
      .then((d) => active && setMe(d))
      .catch(() => {
        if (!active) return;
        setToken('');
        setTok('');
        setMe(null);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      me,
      loading,
      isAuthed: Boolean(token),
      signIn(t) { setToken(t); setTok(t); },
      async signOut() {
        const cur = token;
        setToken(''); setTok(''); setMe(null);
        if (cur) await api.auth.logout(cur).catch(() => undefined);
      },
    }),
    [token, me, loading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
