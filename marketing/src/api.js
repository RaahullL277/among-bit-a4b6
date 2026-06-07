// Public marketing-site client. Only the unauthenticated lead-capture route.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5173';
export const PARTNER_URL = import.meta.env.VITE_PARTNER_URL ?? 'http://localhost:5176';

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}

export const api = {
  // source: 'MERCHANT' | 'PARTNER'
  submitBuild: (body) => req('/leads/store-build', { method: 'POST', body }),
};

const MAX_FILES = 12;
const MAX_PREVIEW_BYTES = 500 * 1024; // only inline small images as previews

/**
 * Read a File into the lead asset shape. Small images become inline data-URL
 * previews; everything else is recorded as a name/type/size manifest entry.
 */
export function readAsset(file) {
  const base = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  const isPreviewable = file.type?.startsWith('image/') && file.size <= MAX_PREVIEW_BYTES;
  if (!isPreviewable) return Promise.resolve(base);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ ...base, dataUrl: String(reader.result) });
    reader.onerror = () => resolve(base);
    reader.readAsDataURL(file);
  });
}

export async function readAssets(fileList) {
  const files = Array.from(fileList).slice(0, MAX_FILES);
  return Promise.all(files.map(readAsset));
}
