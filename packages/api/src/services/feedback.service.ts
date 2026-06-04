import { eq, desc, and, gte, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { episodeFeedback, podcastEpisodes } from '../db/schema.js';
import { hashIp } from '../lib/hash-ip.js';

const REACTIONS = ['up', 'down'] as const;
const CATEGORIES = ['repetitive', 'disagree', 'boring', 'shallow', 'great', 'other'] as const;
const DEDUP_WINDOW_SECONDS = 600;

export type Reaction = typeof REACTIONS[number];
export type Category = typeof CATEGORIES[number];

export interface CreateFeedbackData {
  reaction?: string;
  category: string;
  note?: string;
  listener?: string;
  ipAddress?: string;
}

interface ListByEpisodeOptions {
  limit?: number;
  page?: number;
}

interface ListSinceOptions {
  episodeId?: string;
  limit?: number;
}

export async function createFeedback(episodeId: string, data: CreateFeedbackData) {
  // Required enum
  if (!data.category || !(CATEGORIES as readonly string[]).includes(data.category)) {
    throw new Error('Invalid category');
  }
  // Optional enum — null is allowed (per DP-3 A: category-only tap is fine)
  let reaction: Reaction | null = null;
  if (data.reaction !== undefined && data.reaction !== null) {
    if (!(REACTIONS as readonly string[]).includes(data.reaction)) {
      throw new Error('Invalid reaction');
    }
    reaction = data.reaction as Reaction;
  }

  // Episode existence
  const [ep] = await db.select({ id: podcastEpisodes.id })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, episodeId))
    .limit(1);
  if (!ep) {
    throw new Error('Episode not found');
  }

  // Length caps
  const note = data.note ? data.note.slice(0, 200) : null;
  const listener = data.listener ? data.listener.slice(0, 100) : null;
  const ipHash = data.ipAddress ? hashIp(data.ipAddress) : null;
  const now = Math.floor(Date.now() / 1000);

  // Dedup: only when no note AND ipHash is present.
  // Match the same (episodeId, ipHash, category, reaction) inside the window.
  if (!note && ipHash) {
    const cutoff = now - DEDUP_WINDOW_SECONDS;
    const reactionBranch = reaction === null
      ? isNull(episodeFeedback.reaction)
      : eq(episodeFeedback.reaction, reaction);
    const conditions = [
      eq(episodeFeedback.episodeId, episodeId),
      eq(episodeFeedback.ipHash, ipHash),
      eq(episodeFeedback.category, data.category),
      reactionBranch,
      gte(episodeFeedback.createdAt, cutoff),
    ];
    const [existing] = await db.select()
      .from(episodeFeedback)
      .where(and(...conditions))
      .limit(1);
    if (existing) {
      return existing;
    }
  }

  const id = nanoid();
  const [row] = await db.insert(episodeFeedback).values({
    id,
    episodeId,
    reaction,
    category: data.category,
    note,
    listener,
    ipHash,
    createdAt: now,
  }).returning();

  return row;
}

export async function listFeedbackByEpisode(episodeId: string, options: ListByEpisodeOptions = {}) {
  const { limit = 50, page = 1 } = options;
  const offset = (page - 1) * limit;
  const data = await db.select()
    .from(episodeFeedback)
    .where(eq(episodeFeedback.episodeId, episodeId))
    .orderBy(desc(episodeFeedback.createdAt))
    .limit(limit)
    .offset(offset);
  return { data, page, limit };
}

export async function listFeedbackSince(since: number | undefined, options: ListSinceOptions = {}) {
  const { episodeId, limit: rawLimit } = options;
  // Route adapters parse query strings with parseInt, which yields NaN for
  // non-numeric input (?since=abc, ?limit=foo). Treat NaN as "not provided":
  // gte(col, NaN) / .limit(NaN) would otherwise reach the driver.
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? (rawLimit as number) : 200, 1), 1000);
  const sinceTs = Number.isFinite(since) ? (since as number) : undefined;
  const conditions = [] as ReturnType<typeof eq>[];
  if (sinceTs !== undefined) conditions.push(gte(episodeFeedback.createdAt, sinceTs));
  if (episodeId) conditions.push(eq(episodeFeedback.episodeId, episodeId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select()
    .from(episodeFeedback)
    .where(where)
    .orderBy(desc(episodeFeedback.createdAt))
    .limit(limit);
}
