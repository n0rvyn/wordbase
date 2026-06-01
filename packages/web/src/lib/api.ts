// Build-time only (page frontmatter + sitemap run on the server during the
// static build). Talks to the LOCAL API directly — never the public origin.
const API_URL = import.meta.env.API_URL || 'http://localhost:4100';

export interface Post {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  status: string;
  shareToken: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  meta: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  sortOrder: number;
  status: string;
  meta: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string | null;
  authorUrl: string | null;
  content: string;
  status: string;
  createdAt: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getPosts(params: {
  status?: string;
  category?: string;
  tag?: string;
  page?: number;
  limit?: number;
  search?: string;
} = {}): Promise<PaginatedResponse<Post>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.category) searchParams.set('category', params.category);
  if (params.tag) searchParams.set('tag', params.tag);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);

  const query = searchParams.toString();
  return fetchApi(`/api/posts${query ? `?${query}` : ''}`);
}

export async function getPost(idOrSlug: string): Promise<Post | null> {
  try {
    return await fetchApi(`/api/posts/${idOrSlug}`);
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  return fetchApi('/api/categories');
}

export async function getTags(): Promise<Tag[]> {
  return fetchApi('/api/tags');
}

export async function getPages(): Promise<Page[]> {
  return fetchApi('/api/pages');
}

export async function getPage(slug: string): Promise<Page | null> {
  try {
    return await fetchApi(`/api/pages/${slug}`);
  } catch {
    return null;
  }
}

export async function getCategory(slug: string): Promise<Category | null> {
  try {
    return await fetchApi(`/api/categories/${slug}`);
  } catch {
    return null;
  }
}

export async function getTag(slug: string): Promise<Tag | null> {
  try {
    return await fetchApi(`/api/tags/${slug}`);
  } catch {
    return null;
  }
}

export async function getComments(postId: string): Promise<{ data: Comment[]; page: number; limit: number }> {
  return fetchApi(`/api/posts/${postId}/comments?status=approved`);
}

export async function createComment(postId: string, data: {
  author_name: string;
  author_email?: string;
  author_url?: string;
  content: string;
  parent_id?: string;
}): Promise<Comment> {
  const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getApiUrl(): string {
  return API_URL;
}

export function stripMarkdown(md: string, maxLength = 200): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')  // links → text
    .replace(/(\*\*|__)(.*?)\1/g, '$2')     // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')        // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '')     // inline/block code
    .replace(/^[-*+]\s+/gm, '')             // list markers
    .replace(/^\d+\.\s+/gm, '')             // numbered lists
    .replace(/^>\s+/gm, '')                 // blockquotes
    .replace(/\n{2,}/g, ' ')                // collapse newlines
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

export function formatRelativeDate(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(timestamp);
}

// ---- Apps ----

export interface App {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  icon: string | null;
  description: string | null;
  appStoreUrl: string | null;
  appStoreId: string | null;
  bundleId: string | null;
  platform: string;
  price: string | null;
  rating: number | null;
  ratingCount: number | null;
  accentColor: string | null;
  features: string | null;       // JSON string — parse in consumer
  screenshots: string | null;    // JSON string — parse in consumer
  links: string | null;          // JSON string — parse in consumer
  status: string;
  sortOrder: number | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  meta: string | null;
  category: string | null;
  version: string | null;
  releaseDate: number | null;
  currentVersionReleaseDate: number | null;
  minimumOsVersion: string | null;
  subtitle: string | null;
  whatsNew: string | null;
  featured: number;
  lastSyncedAt: number | null;
}

export async function getApps(params: {
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResponse<App>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return fetchApi(`/api/apps${query ? `?${query}` : ''}`);
}

export async function getApp(idOrSlug: string): Promise<App | null> {
  try {
    return await fetchApi(`/api/apps/${idOrSlug}`);
  } catch {
    return null;
  }
}

// ---- Podcasts ----

export interface Podcast {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  author: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  language: string;
  category: string | null;
  explicit: number;
  link: string | null;
  copyright: string | null;
  status: string;
  sortOrder: number | null;
  createdAt: number;
  updatedAt: number;
  meta: string | null;
}

export interface Episode {
  id: string;
  podcastId: string;
  slug: string;
  guid: string;
  title: string;
  summary: string | null;
  showNotes: string | null;
  transcript: string | null;
  audioUrl: string;
  audioType: string;
  audioSize: number;
  duration: number | null;
  coverImage: string | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  episodeType: string;
  explicit: number | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export async function getPodcasts(params: {
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResponse<Podcast>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return fetchApi(`/api/podcasts${query ? `?${query}` : ''}`);
}

export async function getEpisodes(slug: string, params: {
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedResponse<Episode>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return fetchApi(`/api/podcasts/${slug}/episodes${query ? `?${query}` : ''}`);
}

export function estimateReadTime(content: string): number {
  const words = content.split(/\s+/).length;
  const cjkChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.max(1, Math.ceil((words + cjkChars) / 300));
}
