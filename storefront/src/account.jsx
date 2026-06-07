import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [customer, setCustomer] = useState(null); // null = signed out / unknown
  const [ready, setReady] = useState(false);

  // Restore a session from the stored token on load.
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.account.me()
      .then(setCustomer)
      .catch(() => { setToken(''); setCustomer(null); })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      customer,
      ready,
      signedIn: Boolean(customer),
      // Persist the issued token and the buyer profile after OTP verify.
      signIn(token, c) {
        setToken(token);
        setCustomer(c);
      },
      async signOut() {
        await api.account.logout().catch(() => undefined);
        setToken('');
        setCustomer(null);
      },
    }),
    [customer, ready],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
