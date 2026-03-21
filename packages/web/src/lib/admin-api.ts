const API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.API_URL) || 'http://localhost:4100';

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('wordbase_api_key');
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) throw new Error('Not authenticated');
  return { 'Authorization': `Bearer ${key}` };
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...authHeaders(), ...options.headers as Record<string, string> };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('wordbase_api_key');
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `API error: ${res.status}`);
  }

  return res.json();
}

export async function adminUpload(path: string, formData: FormData): Promise<any> {
  const key = getApiKey();
  if (!key) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem('wordbase_api_key');
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `Upload error: ${res.status}`);
  }

  return res.json();
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/analytics/overview`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function isAuthenticated(): boolean {
  return !!getApiKey();
}

export function logout(): void {
  localStorage.removeItem('wordbase_api_key');
  window.location.href = '/admin/login';
}

export function setApiKey(key: string): void {
  localStorage.setItem('wordbase_api_key', key);
}

export function getApiBaseUrl(): string {
  return API_URL;
}
