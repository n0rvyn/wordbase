import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

export default function TagManager() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    try {
      const data = await adminFetch<any[]>('/api/tags');
      setItems(data);
    } catch {} finally { setLoading(false); }
  }

  async function handleSave() {
    if (!name.trim()) return;
    try {
      if (editId) {
        await adminFetch(`/api/tags/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      } else {
        await adminFetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      }
      setName(''); setEditId(null);
      loadItems();
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete?')) return;
    await adminFetch(`/api/tags/${id}`, { method: 'DELETE' });
    loadItems();
  }

  if (loading) return <p class="text-gray-500">Loading...</p>;

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white border rounded-lg p-6">
        <h2 class="font-semibold mb-4">{editId ? 'Edit' : 'Add'} Tag</h2>
        <div class="flex gap-2">
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Tag name" class="flex-1 px-3 py-2 border rounded-md text-sm" />
          <button onClick={handleSave} class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save</button>
          {editId && <button onClick={() => { setEditId(null); setName(''); }}
            class="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Cancel</button>}
        </div>
      </div>

      <div class="bg-white border rounded-lg">
        {items.length === 0 ? <p class="p-6 text-gray-500">No tags.</p> :
          <div class="p-4 flex flex-wrap gap-2">
            {items.map((item: any) => (
              <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm">
                {item.name}
                <button onClick={() => { setEditId(item.id); setName(item.name); }} class="text-blue-600 hover:text-blue-800 ml-1">edit</button>
                <button onClick={() => handleDelete(item.id)} class="text-red-600 hover:text-red-800">&times;</button>
              </span>
            ))}
          </div>}
      </div>
    </div>
  );
}
