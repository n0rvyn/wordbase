import { db } from '../db/index.js';
import { episodeFeedback, podcastEpisodes, podcasts, apps, podcastEvents, i18nCache } from '../db/schema.js';

export async function resetNewTables() {
  await db.delete(episodeFeedback);
  await db.delete(podcastEvents);
  await db.delete(podcastEpisodes);
  await db.delete(podcasts);
  await db.delete(apps);
  await db.delete(i18nCache);
}
