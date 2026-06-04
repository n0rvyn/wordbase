import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

export default function PostList() {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPosts(); }, [page, statusFilter]);

  async function loadPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminFetch<any>(`/api/posts?${params}`);
      setPosts(res.data);
      setTotal(res.total);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    await adminFetch(`/api/posts/${id}`, { method: 'DELETE' });
    loadPosts();
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          {['', 'draft', 'published', 'archived'].map(s => (
            <button
              onClick={() => { setStatusFilter(s); setPage(1); }}
              class={`px-3 py-1 text-sm rounded ${statusFilter === s ? 'bg-accent text-on-accent' : 'bg-surface border hover:bg-surface-2'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <a href="/admin/posts/new" class="px-4 py-2 bg-accent text-on-accent rounded-lg hover:opacity-90 text-sm">
          New Post
        </a>
      </div>

      {loading ? (
        <p class="text-ink-3">Loading...</p>
      ) : posts.length === 0 ? (
        <p class="text-ink-3">No posts found.</p>
      ) : (
        <div class="bg-surface rounded-lg border divide-y">
          {posts.map((post: any) => (
            <div class="px-6 py-4 flex items-center justify-between">
              <div>
                <a href={`/admin/posts/edit?id=${post.id}`} class="font-medium text-ink hover:text-accent">
                  {post.title}
                </a>
                <p class="text-sm text-ink-3 mt-1">
                  {post.slug} &middot; {new Date(post.createdAt * 1000).toLocaleDateString()}
                </p>
              </div>
              <div class="flex items-center gap-3">
                <span class={`px-2 py-0.5 text-xs rounded-full ${
                  post.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' :
                  post.status === 'draft' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' :
                  'bg-surface-2 text-ink-2'
                }`}>{post.status}</span>
                {post.status === 'draft' && (
                  <button onClick={async () => { await adminFetch(`/api/posts/${post.id}/publish`, { method: 'POST' }); loadPosts(); }}
                    class="text-green-600 hover:text-green-800 text-sm">Publish</button>
                )}
                {post.status === 'published' && (
                  <button onClick={async () => { await adminFetch(`/api/posts/${post.id}/archive`, { method: 'POST' }); loadPosts(); }}
                    class="text-ink-3 hover:text-ink-2 text-sm">Archive</button>
                )}
                <button onClick={() => deletePost(post.id)} class="text-red-500 hover:text-red-700 text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 20 && (
        <div class="flex justify-center gap-2 mt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            class="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <span class="px-3 py-1 text-sm text-ink-3">Page {page}</span>
          <button disabled={posts.length < 20} onClick={() => setPage(p => p + 1)}
            class="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
