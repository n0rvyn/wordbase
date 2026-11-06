import { adminFetch } from './admin-api';

export interface AdminComment {
  id: string;
  postId: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string | null;
  authorUrl: string | null;
  content: string;
  status: string;
  createdAt: number;
  postTitle: string;
}

interface CommentPage {
  data: AdminComment[];
  total: number;
  page: number;
  limit: number;
}

// Preserve the console's complete list without a per-post request waterfall.
// At most 50 rows per request; today's queue fits in a single global page.
export async function loadAdminComments(status: string, signal: AbortSignal): Promise<AdminComment[]> {
  const comments: AdminComment[] = [];
  for (let page = 1; ; page++) {
    const result = await adminFetch<CommentPage>(
      `/api/comments?status=${encodeURIComponent(status)}&page=${page}&limit=50`,
      { signal },
    );
    comments.push(...result.data);
    if (result.data.length === 0 || page * result.limit >= result.total) return comments;
  }
}
