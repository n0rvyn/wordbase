import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

const SETTINGS_FIELDS = [
  { key: 'site.title', label: 'Site Title', type: 'text' },
  { key: 'site.description', label: 'Site Description', type: 'textarea' },
  { key: 'site.author', label: 'Author', type: 'text' },
  { key: 'site.url', label: 'Site URL', type: 'text' },
  { key: 'site.posts_per_page', label: 'Posts per Page', type: 'text' },
  { key: 'comments.moderation', label: 'Comment Moderation', type: 'select', options: ['manual', 'auto-approve'] },
  { key: 'social.twitter', label: 'Twitter Handle', type: 'text' },
  { key: 'social.github', label: 'GitHub URL', type: 'text' },
];

export default function SettingsForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      const data = await adminFetch<Record<string, string>>('/api/settings');
      setValues(data);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await adminFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      setMessage('Settings saved');
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p class="text-ink-3">Loading...</p>;

  return (
    <div class="max-w-2xl">
      <div class="bg-surface border rounded-lg p-6 space-y-4">
        {SETTINGS_FIELDS.map(field => (
          <div>
            <label class="block text-sm font-medium text-ink-2 mb-1">{field.label}</label>
            {field.type === 'select' && 'options' in field ? (
              <select
                value={values[field.key] || (field as any).options[0]}
                onChange={(e) => setValues({ ...values, [field.key]: (e.target as HTMLSelectElement).value })}
                class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(field as any).options.map((opt: string) => (
                  <option value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                value={values[field.key] || ''}
                onInput={(e) => setValues({ ...values, [field.key]: (e.target as HTMLTextAreaElement).value })}
                rows={3} class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <input
                type="text"
                value={values[field.key] || ''}
                onInput={(e) => setValues({ ...values, [field.key]: (e.target as HTMLInputElement).value })}
                class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        <div class="flex items-center gap-4 pt-4">
          <button onClick={handleSave} disabled={saving}
            class="px-6 py-2 bg-accent text-on-accent rounded-lg hover:opacity-90 disabled:opacity-50 text-sm">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {message && <p class={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
        </div>
      </div>
    </div>
  );
}
