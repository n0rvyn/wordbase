const API_URL = ((typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_SITE_URL) || 'http://localhost:4100').replace(/\/$/, '');

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('wordbase_api_key');
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) throw new Error('Not authenticated');
  return { 'Authorization': `Bearer ${key}` };
}

async function adminResponse(path: string, options: RequestInit = {}): Promise<Response> {
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

  return res;
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return (await adminResponse(path,options)).json();
}
export interface Observation {
  observedAt: number; expiresAt: number; source: string; range: string; timezone: string; definition: string;
}
export async function adminObserved<T>(path: string): Promise<{data:T; observation:Observation | null}> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15_000);
  try {
    const response=await adminResponse(path,{signal:controller.signal});
    const raw=response.headers.get('X-Wordbase-Observation');
    let observation:Observation | null=null;
    try {
      const value=raw ? JSON.parse(raw) : null;
      if(value && Number.isFinite(value.observedAt) && Number.isFinite(value.expiresAt) && value.expiresAt >= value.observedAt && ['source','range','timezone','definition'].every(key=>typeof value[key] === 'string')) observation=value;
    } catch { /* metadata unavailable, never fabricate it */ }
    return {data:await response.json(),observation};
  } catch(error) {
    if(controller.signal.aborted) throw new Error('Request timed out after 15 seconds');
    throw error;
  } finally {clearTimeout(timeout);}
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
