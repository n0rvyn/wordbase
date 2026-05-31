import { describe, it, expect } from 'vitest';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

describe('database harness', () => {
  it('initializeDatabase ran and all 3 new tables exist', () => {
    const tables = db.all(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('podcasts', 'podcast_episodes', 'apps')
      ORDER BY name
    `) as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain('podcasts');
    expect(names).toContain('podcast_episodes');
    expect(names).toContain('apps');
  });
});
