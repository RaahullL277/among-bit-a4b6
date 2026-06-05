import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const StoreContext = createContext(null);
const SELECTED_STORAGE = 'acp.selectedStoreId';

/**
 * Loads the merchant's stores once and tracks the currently selected store,
 * which most pages (products, orders, integrations) operate within.
 */
export function StoreProvider({ children }) {
  const [stores, setStores] = useState([]);
  const [selectedId, setSelectedId] = useState(localStorage.getItem(SELECTED_STORAGE) ?? '');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.stores.list();
      setStores(list);
      setSelectedId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_STORAGE, selectedId);
  }, [selectedId]);

  const value = useMemo(
    () => ({
      stores,
      loading,
      selectedId,
      selectedStore: stores.find((s) => s.id === selectedId) ?? null,
      selectStore: setSelectedId,
      refreshStores: refresh,
    }),
    [stores, loading, selectedId],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStores() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStores must be used within StoreProvider');
  return ctx;
}
