// Recently-viewed products, kept per store in localStorage (most recent first).
import { STORE_ID } from './api';

const KEY = `recent.${STORE_ID}`;
const MAX = 12;

export function recordView(productId) {
  if (!productId) return;
  const ids = readIds().filter((id) => id !== productId);
  ids.unshift(productId);
  localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
}

export function readIds() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
