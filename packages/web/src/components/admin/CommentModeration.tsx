import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

export default function CommentModeration() {
  const [comments, setComments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Map<string, string>>(new Map());

  useEffect(() => { loadComments(); }, [statusFilter]);

  async function loadComments() {
    setLoading(true);
    try {
      // Get all posts to map postId → title
      const postsRes = await adminFetch<any>('/api/posts?limit=1000');
      const postMap = new Map<string, string>();
      postsRes.data.forEach((p: any) => postMap.set(p.id, p.title));
      setPosts(postMap);

      // Get comments for each post
      const allComments: any[] = [];
      for (const post of postsRes.data) {
        try {
          const res = await adminFetch<any>(`/api/posts/${post.id}/comments?status=${statusFilter}`);
          allComments.push(...res.data.map((c: any) => ({ ...c, postTitle: post.title })));
        } catch {}
      }
      setComments(allComments);
    } catch {} finally { setLoading(false); }
  }

  async function moderate(id: string, action: string) {
    try {
      await adminFetch(`/api/comments/${id}/${action}`, { method: 'POST' });
      loadComments();
    } catch {}
  }

  async function deleteComment(id: string) {
    if (!confirm('Delete this comment?')) return;
    await adminFetch(`/api/comments/${id}`, { method: 'DELETE' });
    loadComments();
  }

  return (
    <div>
      <div class="flex gap-2 mb-6">
        {['pending', 'approved', 'spam'].map(s => (
          <button onClick={() => setStatusFilter(s)}
            class={`px-3 py-1 text-sm rounded ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p class="text-gray-500">Loading...</p> :
       comments.length === 0 ? <p class="text-gray-500">No {statusFilter} comments.</p> :
        <div class="space-y-4">
          {comments.map((c: any) => (
            <div class="bg-white border rounded-lg p-4">
              <div class="flex items-start justify-between">
                <div>
                  <p class="font-medium">{c.authorName}</p>
                  <p class="text-sm text-gray-500">
                    {c.authorEmail && <span>{c.authorEmail} &middot; </span>}
                    {new Date(c.createdAt * 1000).toLocaleString()} &middot;
                    on <span class="text-blue-600">{c.postTitle}</span>
                  </p>
                </div>
                <div class="flex gap-2">
                  {statusFilter !== 'approved' && (
                    <button onClick={() => moderate(c.id, 'approve')}
                      class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">Approve</button>
                  )}
                  {statusFilter !== 'spam' && (
                    <button onClick={() => moderate(c.id, 'spam')}
                      class="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">Spam</button>
                  )}
                  <button onClick={() => deleteComment(c.id)}
                    class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>
                </div>
              </div>
              <p class="mt-2 text-gray-700">{c.content}</p>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
