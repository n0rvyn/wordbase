import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';
import { marked } from 'marked';

interface Props {
  postId?: string;
}

export default function PostEditor({ postId: propId }: Props) {
  // Read postId from props or URL query param
  const postId = propId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') || undefined : undefined);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [status, setStatus] = useState('draft');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadMetadata();
    if (postId) loadPost();
  }, []);

  async function loadMetadata() {
    try {
      const [cats, tgs] = await Promise.all([
        adminFetch<any[]>('/api/categories'),
        adminFetch<any[]>('/api/tags'),
      ]);
      setCategories(cats);
      setTags(tgs);
    } catch {}
  }

  async function loadPost() {
    try {
      const post = await adminFetch<any>(`/api/posts/${postId}`);
      setTitle(post.title);
      setSlug(post.slug);
      setContent(post.content);
      setExcerpt(post.excerpt || '');
      setCoverImage(post.coverImage || '');
      setStatus(post.status);
    } catch (e: any) {
      setMessage(`Error loading post: ${e.message}`);
    }
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      setMessage('Title and content are required');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const body: any = {
        title,
        content,
        slug: slug || undefined,
        excerpt: excerpt || undefined,
        coverImage: coverImage || undefined,
        status,
        categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
      };

      if (postId) {
        await adminFetch(`/api/posts/${postId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage('Post updated');
      } else {
        const created = await adminFetch<any>('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage('Post created');
        window.location.href = `/admin/posts/edit?id=${created.id}`;
      }
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!postId) {
      setMessage('Save the post first');
      return;
    }
    try {
      await adminFetch(`/api/posts/${postId}/publish`, { method: 'POST' });
      setStatus('published');
      setMessage('Post published');
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  const previewHtml = marked.parse(content || '');

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {saving ? 'Saving...' : 'Save'}
          </button>
          {postId && status !== 'published' && (
            <button onClick={handlePublish}
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
              Publish
            </button>
          )}
          <button onClick={() => setShowPreview(!showPreview)}
            class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {message && <p class={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content */}
        <div class="lg:col-span-3 space-y-4">
          <input
            type="text" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder="Post title" class="w-full px-4 py-3 text-2xl border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="text" value={slug} onInput={(e) => setSlug((e.target as HTMLInputElement).value)}
            placeholder="URL slug (auto-generated if empty)" class="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {showPreview ? (
            <div class="bg-white border rounded-lg p-6 prose prose-lg max-w-none min-h-[400px]" dangerouslySetInnerHTML={{ __html: previewHtml as string }} />
          ) : (
            <textarea
              value={content} onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
              placeholder="Write your post in Markdown..."
              class="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm min-h-[400px] resize-y"
            />
          )}

          <textarea
            value={excerpt} onInput={(e) => setExcerpt((e.target as HTMLTextAreaElement).value)}
            placeholder="Excerpt (optional)" rows={2}
            class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Sidebar */}
        <div class="space-y-4">
          <div class="bg-white border rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Cover Image</label>
            <input
              type="text" value={coverImage} onInput={(e) => setCoverImage((e.target as HTMLInputElement).value)}
              placeholder="Image URL (e.g. /uploads/2026/03/image.png)"
              class="w-full px-3 py-2 border rounded-md text-sm"
            />
            {coverImage && <img src={coverImage} alt="Cover preview" class="mt-2 w-full h-24 object-cover rounded" />}
          </div>

          <div class="bg-white border rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}
              class="w-full px-3 py-2 border rounded-md text-sm">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div class="bg-white border rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Categories</label>
            <div class="space-y-1 max-h-40 overflow-y-auto">
              {categories.map((cat: any) => (
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedCategories.includes(cat.id)}
                    onChange={(e) => {
                      if ((e.target as HTMLInputElement).checked) {
                        setSelectedCategories([...selectedCategories, cat.id]);
                      } else {
                        setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                      }
                    }} />
                  {cat.name}
                </label>
              ))}
              {categories.length === 0 && <p class="text-gray-500 text-xs">No categories</p>}
            </div>
          </div>

          <div class="bg-white border rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Tags</label>
            <div class="space-y-1 max-h-40 overflow-y-auto">
              {tags.map((tag: any) => (
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedTags.includes(tag.id)}
                    onChange={(e) => {
                      if ((e.target as HTMLInputElement).checked) {
                        setSelectedTags([...selectedTags, tag.id]);
                      } else {
                        setSelectedTags(selectedTags.filter(id => id !== tag.id));
                      }
                    }} />
                  {tag.name}
                </label>
              ))}
              {tags.length === 0 && <p class="text-gray-500 text-xs">No tags</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
