import { eq, desc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { podcastEpisodes } from '../db/schema.js';
import { uploadMedia, podcastAudioMaxBytes } from './media.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface ListEpisodesOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listEpisodes(podcastId: string, options: ListEpisodesOptions = {}) {
  const { status, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions = [eq(podcastEpisodes.podcastId, podcastId)];
  if (status) conditions.push(eq(podcastEpisodes.status, status));
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(podcastEpisodes)
    .where(where);
  const total = countResult.count;

  const data = await db
    .select()
    .from(podcastEpisodes)
    .where(where)
    .orderBy(desc(podcastEpisodes.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, total, page, limit };
}

export async function getEpisode(idOrSlug: string) {
  const [byId] = await db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, idOrSlug))
    .limit(1);
  if (byId) return byId;

  const [bySlug] = await db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.slug, idOrSlug))
    .limit(1);
  return bySlug || null;
}

interface CreateEpisodeData {
  title: string;
  audioUrl: string;
  slug?: string;
  guid?: string;
  summary?: string;
  showNotes?: string;
  transcript?: string;
  audioType?: string;
  audioSize?: number;
  duration?: number;
  coverImage?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  episodeType?: string;
  explicit?: number;
  status?: string;
  publishedAt?: number;
  externalSource?: string;
  externalId?: string;
  meta?: string;
}

export async function createEpisode(podcastId: string, data: CreateEpisodeData) {
  if (!data.audioUrl) {
    throw new Error('audioUrl is required');
  }

  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const slug = data.slug || slugify(data.title) || id;
  const guid = data.guid || id;

  const [episode] = await db
    .insert(podcastEpisodes)
    .values({
      id,
      podcastId,
      slug,
      guid,
      title: data.title,
      summary: data.summary ?? null,
      showNotes: data.showNotes ?? null,
      transcript: data.transcript ?? null,
      audioUrl: data.audioUrl,
      audioType: data.audioType || 'audio/mpeg',
      audioSize: Math.floor(data.audioSize ?? 0),
      duration: data.duration !== undefined ? Math.floor(data.duration) : null,
      coverImage: data.coverImage ?? null,
      episodeNumber: data.episodeNumber ?? null,
      seasonNumber: data.seasonNumber ?? null,
      episodeType: data.episodeType || 'full',
      explicit: data.explicit ?? null,
      status: data.status || 'draft',
      // Preserve an explicit pubDate (feed import passes the original date); else
      // null until publishEpisode stamps it.
      publishedAt: data.publishedAt ?? null,
      externalSource: data.externalSource ?? null,
      externalId: data.externalId ?? null,
      createdAt: now,
      updatedAt: now,
      meta: data.meta ?? null,
    })
    .returning();

  return episode;
}

export async function updateEpisode(id: string, data: Partial<CreateEpisodeData>) {
  const now = Math.floor(Date.now() / 1000);
  const updateValues: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined) updateValues.title = data.title;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.guid !== undefined) updateValues.guid = data.guid;
  if (data.summary !== undefined) updateValues.summary = data.summary;
  if (data.showNotes !== undefined) updateValues.showNotes = data.showNotes;
  if (data.transcript !== undefined) updateValues.transcript = data.transcript;
  if (data.audioUrl !== undefined) updateValues.audioUrl = data.audioUrl;
  if (data.audioType !== undefined) updateValues.audioType = data.audioType;
  if (data.audioSize !== undefined) updateValues.audioSize = Math.floor(data.audioSize);
  if (data.duration !== undefined) updateValues.duration = Math.floor(data.duration);
  if (data.coverImage !== undefined) updateValues.coverImage = data.coverImage;
  if (data.episodeNumber !== undefined) updateValues.episodeNumber = data.episodeNumber;
  if (data.seasonNumber !== undefined) updateValues.seasonNumber = data.seasonNumber;
  if (data.episodeType !== undefined) updateValues.episodeType = data.episodeType;
  if (data.explicit !== undefined) updateValues.explicit = data.explicit;
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.publishedAt !== undefined) updateValues.publishedAt = data.publishedAt;
  if (data.externalSource !== undefined) updateValues.externalSource = data.externalSource;
  if (data.externalId !== undefined) updateValues.externalId = data.externalId;
  if (data.meta !== undefined) updateValues.meta = data.meta;

  const [episode] = await db
    .update(podcastEpisodes)
    .set(updateValues)
    .where(eq(podcastEpisodes.id, id))
    .returning();

  return episode || null;
}

export async function deleteEpisode(id: string) {
  const [deleted] = await db
    .delete(podcastEpisodes)
    .where(eq(podcastEpisodes.id, id))
    .returning();
  return deleted || null;
}

export async function publishEpisode(id: string) {
  const now = Math.floor(Date.now() / 1000);
  // Preserve an existing pubDate (e.g. an episode imported from another feed with
  // its original date); only stamp now() the first time it goes live.
  const [existing] = await db
    .select({ publishedAt: podcastEpisodes.publishedAt })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, id))
    .limit(1);
  if (!existing) return null;
  const [episode] = await db
    .update(podcastEpisodes)
    .set({ status: 'published', publishedAt: existing.publishedAt ?? now, updatedAt: now })
    .where(eq(podcastEpisodes.id, id))
    .returning();
  return episode || null;
}

interface UpsertEpisodeByExternalData extends CreateEpisodeData {
  externalSource: string;
  externalId: string;
}

export async function upsertEpisodeByExternal(
  podcastId: string,
  data: UpsertEpisodeByExternalData
) {
  if (!data.externalSource || !data.externalId) {
    throw new Error('externalSource and externalId are required');
  }

  const [existing] = await db
    .select()
    .from(podcastEpisodes)
    .where(
      and(
        eq(podcastEpisodes.externalSource, data.externalSource),
        eq(podcastEpisodes.externalId, data.externalId)
      )
    )
    .limit(1);

  if (existing) {
    const updated = await updateEpisode(existing.id, data);
    return { row: updated!, created: false };
  } else {
    const created = await createEpisode(podcastId, data);
    return { row: created, created: true };
  }
}

interface UploadEpisodeAudioData {
  filename: string;
  base64: string;
  mimeType: string;
}

export async function uploadEpisodeAudio(data: UploadEpisodeAudioData) {
  const buffer = Buffer.from(data.base64, 'base64');
  const file = {
    name: data.filename,
    size: buffer.length,
    type: data.mimeType,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  };

  const record = await uploadMedia({ file, maxSize: podcastAudioMaxBytes() });
  return { url: record.url, size: record.size, mimeType: record.mimeType };
}
