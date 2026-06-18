import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c); // \ % _ 转义为字面
}

function makeSnippet(content: string, term: string, win = 80): string {
  const plain = content.replace(/[#>*`_~\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
  const i = plain.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return plain.slice(0, win);
  const start = Math.max(0, i - Math.floor(win / 3));
  return (start > 0 ? '…' : '') + plain.slice(start, start + win) + (start + win < plain.length ? '…' : '');
}

export interface SearchHit {
  id: string;
  slug: string;
  title: string;
  snippet: string;
  publishedAt: number | null;
  category: string | null;
}

export async function searchPosts(q: string, limit = 20): Promise<SearchHit[]> {
  const term = (q ?? '').trim().slice(0, 200);
  if (!term) return [];
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const like = `%${escapeLike(term)}%`;
  try {
    const rows = db.all(sql`
      SELECT p.id AS id, p.slug AS slug, p.title AS title,
             p.content AS content, p.published_at AS publishedAt,
             (p.title LIKE ${like} ESCAPE '\\') AS titleHit,
             (SELECT c.name FROM post_categories pc
                JOIN categories c ON c.id = pc.category_id
               WHERE pc.post_id = p.id LIMIT 1) AS category
      FROM posts p
      WHERE p.status = 'published'
        AND (p.title LIKE ${like} ESCAPE '\\' OR p.content LIKE ${like} ESCAPE '\\')
      ORDER BY titleHit DESC, p.published_at DESC
      LIMIT ${lim}
    `) as Array<{ id: string; slug: string; title: string; content: string; publishedAt: number | null; category: string | null }>;
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      snippet: makeSnippet(r.content ?? '', term),
      publishedAt: r.publishedAt,
      category: r.category ?? null,
    }));
  } catch {
    return []; // 降级:绝不向公网抛 500
  }
}
