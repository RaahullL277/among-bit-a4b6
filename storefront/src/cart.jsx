import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, STORE_ID } from './api';

const CartContext = createContext(null);
const CART_KEY = `cart.${STORE_ID}`;

export function CartProvider({ children }) {
  const [cartId, setCartId] = useState(localStorage.getItem(CART_KEY) ?? '');
  const [cart, setCart] = useState(null);

  useEffect(() => {
    if (!cartId) return;
    api.getCart(cartId).then(setCart).catch(() => {
      // Stale/cleared cart — start fresh.
      localStorage.removeItem(CART_KEY);
      setCartId('');
      setCart(null);
    });
  }, [cartId]);

  const value = useMemo(
    () => ({
      cart,
      cartId,
      itemCount: (cart?.items ?? []).reduce((n, i) => n + i.quantity, 0),
      async addToCart(variantId, quantity = 1) {
        if (!cartId) {
          const created = await api.createCart(STORE_ID, { items: [{ variantId, quantity }] });
          localStorage.setItem(CART_KEY, created.id);
          setCartId(created.id);
          setCart(created);
        } else {
          setCart(await api.addItem(cartId, { variantId, quantity }));
        }
      },
      async refresh() {
        if (cartId) setCart(await api.getCart(cartId));
      },
      clear() {
        localStorage.removeItem(CART_KEY);
        setCartId('');
        setCart(null);
      },
    }),
    [cart, cartId],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
