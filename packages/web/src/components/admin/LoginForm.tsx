import { useState } from 'preact/hooks';
import { validateApiKey, setApiKey } from '../../lib/admin-api';

export default function LoginForm() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError('');

    const valid = await validateApiKey(key.trim());
    if (valid) {
      setApiKey(key.trim());
      window.location.href = '/admin';
    } else {
      setError('Invalid API key');
      setLoading(false);
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-paper">
      <div class="bg-surface rounded-lg shadow-md p-8 w-full max-w-md">
        <h1 class="text-2xl font-bold text-center mb-6">Wordbase Admin</h1>
        <form onSubmit={handleSubmit}>
          <div class="mb-4">
            <label class="block text-sm font-medium text-ink-2 mb-2">API Key</label>
            <input
              type="password"
              value={key}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
              placeholder="Enter your API key"
              class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && <p class="text-red-600 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading || !key.trim()}
            class="w-full py-2 bg-accent text-on-accent rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
