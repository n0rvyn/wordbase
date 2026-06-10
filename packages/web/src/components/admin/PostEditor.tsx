import { useState, useEffect, useRef } from 'preact/hooks';
import { adminFetch, adminUpload } from '../../lib/admin-api';
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
  const [tagInput, setTagInput] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

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

  async function addTagByName(raw: string) {
    const name = raw.trim();
    if (!name) return;
    // Reuse an already-loaded tag by case-insensitive name before creating one.
    const existing = tags.find((t: any) => (t.name as string).toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTags.includes(existing.id)) setSelectedTags([...selectedTags, existing.id]);
      setTagInput('');
      return;
    }
    try {
      // Backend create-or-attach: returns an existing tag on slug match, else creates.
      const created = await adminFetch<any>('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setTags((prev) => (prev.some((t: any) => t.id === created.id) ? prev : [...prev, created]));
      setSelectedTags((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setTagInput('');
    } catch (e: any) {
      setMessage(`Error adding tag: ${e.message}`);
    }
  }

  function removeTag(id: string) {
    setSelectedTags(selectedTags.filter((t) => t !== id));
  }

  // Upload an image and splice the resulting Markdown at the textarea caret.
  // The URL is stored relative (/uploads/...) so it resolves wherever the
  // rendered post is served (Caddy on prod) — never an absolute API origin.
  async function uploadAndInsertImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setMessage('Error: only image files can be inserted');
      return;
    }
    const ta = contentRef.current;
    const start = ta?.selectionStart ?? content.length;
    const end = ta?.selectionEnd ?? content.length;

    setUploadingImage(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const media = await adminUpload('/api/media', formData);
      // Square brackets would break the Markdown image syntax — strip them.
      const alt = String(media.altText || media.filename || 'image').replace(/[\[\]]/g, '');
      const md = `![${alt}](${media.url})`;
      const next = content.slice(0, start) + md + content.slice(end);
      setContent(next);
      setMessage('Image inserted');
      requestAnimationFrame(() => {
        const el = contentRef.current;
        if (!el) return;
        el.focus();
        const pos = start + md.length;
        el.setSelectionRange(pos, pos);
      });
    } catch (e: any) {
      setMessage(`Image upload failed: ${e.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImagePick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await uploadAndInsertImage(file);
    input.value = '';
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          uploadAndInsertImage(file);
          return;
        }
      }
    }
  }

  function handleDrop(e: DragEvent) {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      uploadAndInsertImage(file);
    }
  }

  async function handleCoverUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const media = await adminUpload('/api/media', formData);
      setCoverImage(media.url);
      setMessage('Cover image uploaded');
    } catch (e: any) {
      setMessage(`Cover upload failed: ${e.message}`);
    } finally {
      setUploadingCover(false);
      input.value = '';
    }
  }

  const previewHtml = marked.parse(content || '');

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            class="px-4 py-2 bg-accent text-on-accent rounded-lg hover:opacity-90 disabled:opacity-50 text-sm">
            {saving ? 'Saving...' : 'Save'}
          </button>
          {postId && status !== 'published' && (
            <button onClick={handlePublish}
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
              Publish
            </button>
          )}
          <button onClick={() => setShowPreview(!showPreview)}
            class="px-4 py-2 border rounded-lg hover:bg-surface-2 text-sm lg:hidden">
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

          {/* Editor toolbar: image insert. Paste/drag also work on the textarea. */}
          <div class="flex items-center gap-3">
            <label class={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm cursor-pointer hover:bg-surface-2 ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingImage ? 'Uploading…' : '🖼 Insert image'}
              <input type="file" accept="image/*" class="hidden" onChange={handleImagePick} disabled={uploadingImage} />
            </label>
            <span class="text-xs text-ink-3">or paste / drag an image into the editor</span>
          </div>

          {/* Live split: editor + rendered preview side by side on large screens.
              On mobile the Edit/Preview toggle swaps which single pane shows. */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <textarea
              ref={contentRef}
              value={content} onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              placeholder="Write your post in Markdown..."
              class={`${showPreview ? 'hidden lg:block' : 'block'} w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm min-h-[400px] resize-y`}
            />
            <div
              class={`${showPreview ? 'block' : 'hidden lg:block'} bg-surface border rounded-lg p-6 prose prose-lg max-w-none min-h-[400px] overflow-auto`}
              dangerouslySetInnerHTML={{ __html: previewHtml as string }}
            />
          </div>

          <textarea
            value={excerpt} onInput={(e) => setExcerpt((e.target as HTMLTextAreaElement).value)}
            placeholder="Excerpt (optional)" rows={2}
            class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Sidebar */}
        <div class="space-y-4">
          <div class="bg-surface border rounded-lg p-4">
            <label class="block text-sm font-medium text-ink-2 mb-2">Cover Image</label>
            <input
              type="text" value={coverImage} onInput={(e) => setCoverImage((e.target as HTMLInputElement).value)}
              placeholder="Image URL (e.g. /uploads/2026/03/image.png)"
              class="w-full px-3 py-2 border rounded-md text-sm"
            />
            <label class={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm cursor-pointer hover:bg-surface-2 ${uploadingCover ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingCover ? 'Uploading…' : 'Upload image'}
              <input type="file" accept="image/*" class="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
            </label>
            {coverImage && <img src={coverImage} alt="Cover preview" class="mt-2 w-full h-24 object-cover rounded" />}
          </div>

          <div class="bg-surface border rounded-lg p-4">
            <label class="block text-sm font-medium text-ink-2 mb-2">Status</label>
            <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}
              class="w-full px-3 py-2 border rounded-md text-sm">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div class="bg-surface border rounded-lg p-4">
            <label class="block text-sm font-medium text-ink-2 mb-2">Categories</label>
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
              {categories.length === 0 && <p class="text-ink-3 text-xs">No categories</p>}
            </div>
          </div>

          <div class="bg-surface border rounded-lg p-4">
            <label class="block text-sm font-medium text-ink-2 mb-2">Tags</label>
            {/* Selected tags as removable chips */}
            <div class="flex flex-wrap gap-1 mb-2">
              {selectedTags.map((id) => {
                const t = tags.find((x: any) => x.id === id);
                return (
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-2 text-ink-2 rounded-full text-xs">
                    {t ? t.name : id}
                    <button type="button" onClick={() => removeTag(id)} class="hover:text-ink leading-none">&times;</button>
                  </span>
                );
              })}
              {selectedTags.length === 0 && <span class="text-ink-3 text-xs">No tags yet</span>}
            </div>
            {/* Free-text input: type a tag and press Enter to create or attach it.
                The datalist offers existing tags as suggestions without limiting input. */}
            <input
              type="text" value={tagInput}
              onInput={(e) => setTagInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagByName(tagInput); } }}
              list="tag-suggestions"
              placeholder="Type a tag, press Enter"
              class="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="tag-suggestions">
              {tags.map((t: any) => <option value={t.name} />)}
            </datalist>
          </div>
        </div>
      </div>
    </div>
  );
}
