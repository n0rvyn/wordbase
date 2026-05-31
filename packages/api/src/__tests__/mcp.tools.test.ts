import { describe, it, expect } from 'vitest';
import { registerTools } from '../mcp/tools.js';

describe('registerTools — tool name registration', () => {
  function buildFakeServer() {
    const names: string[] = [];
    const server = {
      tool(name: string, _desc: string, _schema: unknown, _handler: unknown) {
        names.push(name);
      },
      getNames() {
        return names;
      },
    };
    return server;
  }

  it('registers all existing blog_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('blog_create_post');
    expect(names).toContain('blog_upload_media');
    expect(names).toContain('blog_list_posts');
    expect(names).toContain('blog_get_post');
    expect(names).toContain('blog_list_media');
    expect(names).toContain('blog_trigger_build');
  });

  it('registers new podcast_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('podcast_list_shows');
    expect(names).toContain('podcast_create_show');
    expect(names).toContain('podcast_publish_show');
    expect(names).toContain('podcast_list_episodes');
    expect(names).toContain('podcast_create_episode');
    expect(names).toContain('podcast_upload_audio');
    expect(names).toContain('podcast_publish_episode');
  });

  it('registers new app_* tools', () => {
    const server = buildFakeServer();
    registerTools(server);
    const names = server.getNames();
    expect(names).toContain('app_list');
    expect(names).toContain('app_create');
    expect(names).toContain('app_publish');
  });
});
