import { useState, useEffect } from 'preact/hooks';
import { SITE_COPY_FIELDS } from '../../lib/site-copy';
import { adminFetch } from '../../lib/admin-api';

const SECTION_LABELS: Record<string, string> = { 'site.title': 'Site header', 'site.copy.eyebrow': 'Homepage', 'site.copy.footerZh': 'Footer', 'site.copy.shareTitleZh': 'Homepage share preview', 'site.description': 'Site information and existing settings' };

const SETTINGS_FIELDS = [
  { key: 'site.title', label: 'Header / site name', type: 'text' },
  ...Object.entries(SITE_COPY_FIELDS).map(([name, field]) => ({ key: `site.copy.${name}`, label: field.label, type: name.startsWith('intro') ? 'textarea' : 'text', placeholder: field.default, maxLength: field.maxLength })),
  { key: 'site.description', label: 'Site Description', type: 'textarea' },
  { key: 'site.author', label: 'Author', type: 'text' },
  { key: 'site.email', label: 'Site Email', type: 'text' },
  { key: 'site.url', label: 'Site URL', type: 'text' },
  { key: 'site.posts_per_page', label: 'Posts per Page', type: 'text' },
  { key: 'comments.moderation', label: 'Comment Moderation', type: 'select', options: ['manual', 'auto-approve'] },
  { key: 'social.twitter', label: 'Twitter Handle', type: 'text' },
  { key: 'social.github', label: 'GitHub URL', type: 'text' },
];

export default function SettingsForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      const data = await adminFetch<Record<string, string>>('/api/settings');
      setValues(data);
      setSavedValues(data);
    } catch (e: any) {
      setLoadError(true);
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const changes = Object.fromEntries(SETTINGS_FIELDS.filter(field => (values[field.key] || '') !== (savedValues[field.key] || '')).map(field => [field.key, values[field.key] || '']));
    if (!Object.keys(changes).length) { setMessage('No changes to save.'); return; }
    setSaving(true);
    setMessage('');
    try {
      await adminFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      setSavedValues(values);
      setMessage('Settings saved. Publishing requested; the public site updates after the build completes.');
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p role="alert" class="text-red-600">Unable to load settings: {message}. Reload the page to retry.</p>;
  if (loading) return <p class="text-ink-3">Loading...</p>;

  return (
    <div class="w-full">
      <p class="text-sm text-ink-3 mb-4">Header text is shared across the site. Homepage and footer copy supports both languages. Leave copy fields empty to use the current default; line breaks are allowed in introductions. Saving requests a site rebuild. Share artwork and URLs stay unchanged.</p>
      <div class="bg-surface border rounded-lg p-6 space-y-4">
        {SETTINGS_FIELDS.map(field => (
          <div>
            {SECTION_LABELS[field.key] && <h2 class="text-lg font-semibold text-ink mb-3 pt-3">{SECTION_LABELS[field.key]}</h2>}
            <label for={field.key} class="block text-sm font-medium text-ink-2 mb-1">{field.label}</label>
            {field.type === 'select' && 'options' in field ? (
              <select id={field.key}
                value={values[field.key] || (field as any).options[0]}
                onChange={(e) => setValues({ ...values, [field.key]: (e.target as HTMLSelectElement).value })}
                class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(field as any).options.map((opt: string) => (
                  <option value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea id={field.key} placeholder={'placeholder' in field ? field.placeholder : undefined} maxLength={'maxLength' in field ? field.maxLength : undefined}
                value={values[field.key] || ''}
                onInput={(e) => setValues({ ...values, [field.key]: (e.target as HTMLTextAreaElement).value })}
                rows={3} class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <input id={field.key} placeholder={'placeholder' in field ? field.placeholder : undefined} maxLength={'maxLength' in field ? field.maxLength : field.key === 'site.title' ? 100 : undefined}
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
          {message && <p role="status" class={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
        </div>
      </div>
    </div>
  );
}
