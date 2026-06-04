import { useState, useEffect } from 'preact/hooks';
import { adminFetch } from '../../lib/admin-api';

interface Overview {
  totalPageViews: number;
  todayPageViews: number;
  activePostCount: number;
}

interface PostsResponse {
  data: any[];
  total: number;
}

interface CommentsResponse {
  data: any[];
}

export default function DashboardStats() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [postsTotal, setPostsTotal] = useState(0);
  const [pendingComments, setPendingComments] = useState(0);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [ov, posts] = await Promise.all([
        adminFetch<Overview>('/api/analytics/overview'),
        adminFetch<PostsResponse>('/api/posts?limit=5'),
      ]);
      setOverview(ov);
      setPostsTotal(posts.total);
      setRecentPosts(posts.data);

      // Count pending comments across all posts
      let pending = 0;
      for (const post of posts.data) {
        try {
          const comments = await adminFetch<any>(`/api/posts/${post.id}/comments?status=pending`);
          pending += comments.data.length;
        } catch {}
      }
      setPendingComments(pending);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p class="text-ink-3">Loading...</p>;
  if (error) return <p class="text-red-600">{error}</p>;

  return (
    <div>
      {/* Stats cards */}
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div class="bg-surface rounded-lg border p-6">
          <p class="text-sm text-ink-3">Total Posts</p>
          <p class="text-3xl font-bold mt-1">{postsTotal}</p>
        </div>
        <div class="bg-surface rounded-lg border p-6">
          <p class="text-sm text-ink-3">Published</p>
          <p class="text-3xl font-bold mt-1">{overview?.activePostCount || 0}</p>
        </div>
        <div class="bg-surface rounded-lg border p-6">
          <p class="text-sm text-ink-3">Pending Comments</p>
          <p class="text-3xl font-bold mt-1 text-yellow-600">{pendingComments}</p>
        </div>
        <div class="bg-surface rounded-lg border p-6">
          <p class="text-sm text-ink-3">Total Views</p>
          <p class="text-3xl font-bold mt-1">{overview?.totalPageViews || 0}</p>
        </div>
        <div class="bg-surface rounded-lg border p-6">
          <p class="text-sm text-ink-3">Today's Views</p>
          <p class="text-3xl font-bold mt-1">{overview?.todayPageViews || 0}</p>
        </div>
      </div>

      {/* Recent posts */}
      <div class="bg-surface rounded-lg border">
        <div class="px-6 py-4 border-b">
          <h2 class="text-lg font-semibold">Recent Posts</h2>
        </div>
        <div class="divide-y">
          {recentPosts.length === 0 ? (
            <p class="px-6 py-4 text-ink-3">No posts yet.</p>
          ) : (
            recentPosts.map((post: any) => (
              <div class="px-6 py-3 flex items-center justify-between">
                <div>
                  <a href={`/admin/posts/edit?id=${post.id}`} class="text-accent hover:underline font-medium">
                    {post.title}
                  </a>
                  <p class="text-sm text-ink-3 mt-0.5">
                    {post.status} &middot; {new Date(post.createdAt * 1000).toLocaleDateString()}
                  </p>
                </div>
                <span class={`px-2 py-0.5 text-xs rounded-full ${
                  post.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' :
                  post.status === 'draft' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' :
                  'bg-surface-2 text-ink-2'
                }`}>
                  {post.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
