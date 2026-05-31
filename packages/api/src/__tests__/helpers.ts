import { db } from '../db/index.js';
import { podcastEpisodes, podcasts, apps } from '../db/schema.js';

export async function resetNewTables() {
  await db.delete(podcastEpisodes);
  await db.delete(podcasts);
  await db.delete(apps);
}
