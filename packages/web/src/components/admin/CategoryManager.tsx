import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

export default function CategoryManager() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    try {
      const data = await adminFetch<any[]>('/api/categories');
      setItems(data);
    } catch {} finally { setLoading(false); }
  }

  async function handleSave() {
    if (!name.trim()) return;
    const body = { name, slug: slug || undefined, description: description || undefined };
    try {
      if (editId) {
        await adminFetch(`/api/categories/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await adminFetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setName(''); setSlug(''); setDescription(''); setEditId(null);
      loadItems();
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete?')) return;
    await adminFetch(`/api/categories/${id}`, { method: 'DELETE' });
    loadItems();
  }

  function startEdit(item: any) {
    setEditId(item.id); setName(item.name); setSlug(item.slug); setDescription(item.description || '');
  }

  if (loading) return <p class="text-ink-3">Loading...</p>;

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-surface border rounded-lg p-6">
        <h2 class="font-semibold mb-4">{editId ? 'Edit' : 'Add'} Category</h2>
        <div class="space-y-3">
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Name" class="w-full px-3 py-2 border rounded-md text-sm" />
          <input value={slug} onInput={(e) => setSlug((e.target as HTMLInputElement).value)}
            placeholder="Slug (auto)" class="w-full px-3 py-2 border rounded-md text-sm" />
          <textarea value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            placeholder="Description" rows={2} class="w-full px-3 py-2 border rounded-md text-sm" />
          <div class="flex gap-2">
            <button onClick={handleSave} class="px-4 py-2 bg-accent text-on-accent rounded-md text-sm hover:opacity-90">Save</button>
            {editId && <button onClick={() => { setEditId(null); setName(''); setSlug(''); setDescription(''); }}
              class="px-4 py-2 border rounded-md text-sm hover:bg-surface-2">Cancel</button>}
          </div>
        </div>
      </div>

      <div class="bg-surface border rounded-lg divide-y">
        {items.length === 0 ? <p class="p-6 text-ink-3">No categories.</p> :
          items.map((item: any) => (
            <div class="px-6 py-3 flex items-center justify-between">
              <div>
                <span class="font-medium">{item.name}</span>
                <span class="text-sm text-ink-3 ml-2">/{item.slug}</span>
              </div>
              <div class="flex gap-2">
                <button onClick={() => startEdit(item)} class="text-sm text-accent hover:underline">Edit</button>
                <button onClick={() => handleDelete(item.id)} class="text-sm text-red-600 hover:underline">Delete</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
