import { db } from '../db/index.js';
import { podcastEpisodes, podcasts, apps, podcastEvents } from '../db/schema.js';

export async function resetNewTables() {
  await db.delete(podcastEvents);
  await db.delete(podcastEpisodes);
  await db.delete(podcasts);
  await db.delete(apps);
}
