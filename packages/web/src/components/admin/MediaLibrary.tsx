import { useState, useEffect } from 'preact/hooks';
import { adminFetch, adminUpload } from '../../lib/admin-api';

export default function MediaLibrary() {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadMedia(); }, []);

  async function loadMedia() {
    try {
      const res = await adminFetch<any>('/api/media');
      setMedia(res.data);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      await adminUpload('/api/media', formData);
      setMessage('Uploaded');
      input.value = '';
      loadMedia();
    } catch (e: any) {
      setMessage(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this file?')) return;
    try {
      await adminFetch(`/api/media/${id}`, { method: 'DELETE' });
      loadMedia();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setMessage('URL copied');
    setTimeout(() => setMessage(''), 2000);
  }

  if (loading) return <p class="text-gray-500">Loading...</p>;

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <label class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
            {uploading ? 'Uploading...' : 'Upload File'}
            <input type="file" class="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        {message && <p class="text-sm text-green-600">{message}</p>}
      </div>

      {media.length === 0 ? (
        <p class="text-gray-500">No media files.</p>
      ) : (
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {media.map((item: any) => (
            <div class="bg-white border rounded-lg overflow-hidden group">
              {item.mimeType.startsWith('image/') ? (
                <img src={item.url} alt={item.altText || item.filename} class="w-full h-32 object-cover" />
              ) : (
                <div class="w-full h-32 flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                  {item.filename}
                </div>
              )}
              <div class="p-2">
                <p class="text-xs text-gray-600 truncate">{item.filename}</p>
                <p class="text-xs text-gray-400">{(item.size / 1024).toFixed(1)} KB</p>
                <div class="flex gap-1 mt-1">
                  <button onClick={() => copyUrl(item.url)} class="text-xs text-blue-600 hover:underline">Copy URL</button>
                  <button onClick={() => handleDelete(item.id)} class="text-xs text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
