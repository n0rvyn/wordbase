import { useState, useEffect, useRef } from 'preact/hooks';
import { adminObserved } from '../../lib/admin-api';
import { emptyReading, type Reading } from './DataNote';
import { ReadingCaption, MeasurementDetails } from './MeasurementDetails';
import { buildLabel, shortUtc } from '../../lib/admin-presentation';
interface Overview {
  totalPageViews: number;
  todayPageViews: number;
  activePostCount: number;
}
interface PostsResponse {
  data: { id: string; title: string; status: string; createdAt: number }[];
  total: number;
}
interface Content {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
}
interface Publishing {
  ops: {
    build: {
      status: string;
      completedAt: number | null;
      startedAt: number | null;
      error: string | null;
    };
  };
}
const number = (value: number | undefined) =>
  value === undefined ? '—' : value.toLocaleString();
export default function DashboardStats() {
  const [overview, setOverview] = useState(emptyReading<Overview>());
  const [posts, setPosts] = useState(emptyReading<PostsResponse>());
  const [comments, setComments] =
    useState(emptyReading<{ pending: number; total: number }>());
  const [content, setContent] = useState(emptyReading<Content>());
  const [publishing, setPublishing] = useState(emptyReading<Publishing>());
  const [traffic, setTraffic] = useState(emptyReading<{ pageViews: number }>());
  const [trends, setTrends] =
    useState(emptyReading<{ period: string; pageViews: number }[]>());
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const alive = useRef(true);
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    async function read<T>(
      path: string,
      set: (update: (previous: Reading<T>) => Reading<T>) => void,
    ) {
      try {
        const result = await adminObserved<T>(path);
        if (alive.current)
          set(() => ({ ...result, error: null, fetchedAt: Date.now() }));
      } catch (error) {
        if (alive.current)
          set((previous) => ({
            ...previous,
            error: error instanceof Error ? error.message : 'Request failed',
          }));
      }
    }
    await Promise.all([
      read<Overview>('/api/analytics/overview', setOverview),
      read<{ period: string; pageViews: number }[]>(
        '/api/observability/trends?period=daily',
        setTrends,
      ),
      read<PostsResponse>('/api/posts?limit=5', setPosts),
      read<{ pending: number; total: number }>(
        '/api/comments/counts',
        setComments,
      ),
      read<Content>('/api/observability/content', setContent),
      read<Publishing>('/api/observability/system', setPublishing),
      read<{ pageViews: number }>(
        '/api/observability/visits?days=30',
        setTraffic,
      ),
    ]);
    if (alive.current) {
      setNow(Date.now());
      setLoading(false);
    }
    busy.current = false;
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    const refreshTimer = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      alive.current = false;
      clearInterval(refreshTimer);
      clearInterval(clock);
    };
  }, []);
  const entries = [
    { label: 'Traffic today & lifetime', reading: overview },
    { label: 'Traffic · 30 UTC days', reading: traffic },
    { label: 'Daily traffic · 30 UTC days', reading: trends },
    { label: 'Comment queue · all posts', reading: comments },
    { label: 'Post counts by status', reading: content },
    { label: 'Latest static build', reading: publishing },
    { label: 'Recent content records', reading: posts },
  ];
  const failures = entries.filter((entry) => entry.reading.error).length;
  const build = publishing.data?.ops.build;
  return (
    <div class="admin-board">
      <header class="board-header">
        <div>
          <p class="board-eyebrow">
            Your workspace ·{' '}
            {new Intl.DateTimeFormat('en-GB', {
              timeZone: 'UTC',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(now)}
          </p>
          <h2>The site, at a glance.</h2>
          <p>What needs your attention, and what’s happening on the site.</p>
        </div>
        <div class="board-header-actions">
          <button
            class="board-button quiet"
            onClick={() => void refresh()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <a class="board-button primary" href="/admin/posts/new">
            <span aria-hidden="true">＋</span> Write a post
          </a>
        </div>
      </header>
      {failures > 0 && (
        <p class="board-alert" role="alert">
          {failures} source{failures === 1 ? '' : 's'} could not refresh.
          Unavailable or older readings are marked below.
        </p>
      )}

      <section class="board-work" aria-labelledby="work-heading">
        <div class="board-section-intro">
          <h3 id="work-heading">Pick up where you left off</h3>
          <span>Editorial queue</span>
        </div>
        <div class="board-work-items">
          <a
            class={`board-work-item ${comments.data?.pending ? 'needs-attention' : ''}`}
            href="/admin/comments"
          >
            <span class="board-work-symbol" aria-hidden="true">
              ↳
            </span>
            <div>
              <h4>Comments to review</h4>
              <p>
                {comments.data === null
                  ? 'Queue unavailable'
                  : comments.data.pending === 0
                    ? 'You’re all caught up'
                    : 'Awaiting moderation across all posts'}
              </p>
              <ReadingCaption reading={comments} now={now} />
            </div>
            <strong>{number(comments.data?.pending)}</strong>
            <span class="board-arrow" aria-hidden="true">
              →
            </span>
          </a>
          <a class="board-work-item" href="/admin/posts?status=draft">
            <span class="board-work-symbol" aria-hidden="true">
              ✎
            </span>
            <div>
              <h4>Continue a draft</h4>
              <p>Unpublished posts in your workspace</p>
              <ReadingCaption reading={content} now={now} />
            </div>
            <strong>{number(content.data?.draftPosts)}</strong>
            <span class="board-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </section>

      <section class="board-audience" aria-labelledby="traffic-heading">
        <div class="board-section-intro">
          <div>
            <h3 id="traffic-heading">Recorded traffic</h3>
            <p>Page views, with recognized bots excluded.</p>
          </div>
          <a class="board-text-link" href="/admin/observability#audience">
            Explore audience <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div class="board-audience-body">
          <div class="board-metrics">
            <div>
              <p>
                Today <small>UTC · partial day</small>
              </p>
              <strong>{number(overview.data?.todayPageViews)}</strong>
              <ReadingCaption reading={overview} now={now} />
            </div>
            <div>
              <p>
                Last 30 days <small>UTC · includes today</small>
              </p>
              <strong>{number(traffic.data?.pageViews)}</strong>
              <ReadingCaption reading={traffic} now={now} />
            </div>
            <div>
              <p>
                All recorded views <small>Retained history</small>
              </p>
              <strong>{number(overview.data?.totalPageViews)}</strong>
              <ReadingCaption reading={overview} now={now} />
            </div>
          </div>
          <div class="board-trend">
            <TrafficTrend rows={trends.data} />
            <ReadingCaption reading={trends} now={now} />
          </div>
        </div>
      </section>

      <div class="board-workspace">
        <section
          class="board-panel board-recent"
          aria-labelledby="recent-heading"
        >
          <div class="board-section-intro">
            <div>
              <h3 id="recent-heading">Recent posts</h3>
              <p>Newest first · creation date in UTC</p>
            </div>
            <a class="board-text-link" href="/admin/posts">
              All posts ↗
            </a>
          </div>
          <div class="board-post-head" aria-hidden="true">
            <span>Post</span>
            <span>Created</span>
          </div>
          {posts.data === null ? (
            <div class="board-empty">
              {posts.error
                ? 'Recent posts are unavailable.'
                : 'Loading recent posts…'}
            </div>
          ) : posts.data.data.length === 0 ? (
            <div class="board-empty">
              No posts yet. <a href="/admin/posts/new">Write the first one →</a>
            </div>
          ) : (
            <div class="board-posts">
              {posts.data.data.map((post) => (
                <article class="board-post" key={post.id}>
                  <div>
                    <a
                      class="board-post-title"
                      href={`/admin/posts/edit?id=${encodeURIComponent(post.id)}`}
                    >
                      {post.title}
                    </a>
                    <span class={`board-post-status status-${post.status}`}>
                      {post.status}
                    </span>
                  </div>
                  <time
                    dateTime={new Date(post.createdAt * 1000).toISOString()}
                  >
                    {new Intl.DateTimeFormat('en-GB', {
                      timeZone: 'UTC',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }).format(post.createdAt * 1000)}
                  </time>
                  <span aria-hidden="true" class="board-row-arrow">
                    ↗
                  </span>
                </article>
              ))}
            </div>
          )}
          <div class="board-recent-footer">
            <ReadingCaption reading={posts} now={now} />
          </div>
        </section>

        <aside class="board-publishing" aria-label="Publishing and content">
          <section
            class={`board-panel board-build ${build?.status === 'failed' ? 'build-failed' : ''}`}
          >
            <div class="board-section-intro">
              <h3>Publishing</h3>
              <span class="board-small-label">Latest static build</span>
            </div>
            <div class="board-build-state">
              <span
                class={`board-state-dot state-${build?.status ?? 'unknown'}`}
                aria-hidden="true"
              />
              {buildLabel(build?.status)}
            </div>
            <p class="board-build-time">
              {publishing.data === null
                ? 'Build time unavailable'
                : build?.completedAt
                  ? shortUtc(build.completedAt)
                  : build?.startedAt
                    ? `Started ${shortUtc(build.startedAt)}`
                    : 'No completed build recorded'}
            </p>
            {build?.status === 'failed' && (
              <p class="board-build-warning">
                The latest build failed. Check the details before publishing
                again.
              </p>
            )}
            <ReadingCaption reading={publishing} now={now} />
            <a class="board-task-link" href="/admin/observability#health">
              Open operations <span aria-hidden="true">→</span>
            </a>
            <p class="board-small-note">
              Build status describes publishing, not public uptime.
            </p>
          </section>
          <section class="board-panel board-library">
            <div class="board-section-intro">
              <h3>Content library</h3>
            </div>
            <dl>
              <div>
                <dt>Published posts</dt>
                <dd>{number(content.data?.publishedPosts)}</dd>
              </div>
              <div>
                <dt>Draft posts</dt>
                <dd>{number(content.data?.draftPosts)}</dd>
              </div>
              <div>
                <dt>All stored posts</dt>
                <dd>{number(content.data?.totalPosts)}</dd>
              </div>
            </dl>
            <ReadingCaption reading={content} now={now} />
            <a class="board-task-link" href="/admin/settings">
              Site identity & settings <span aria-hidden="true">→</span>
            </a>
          </section>
        </aside>
      </div>
      <MeasurementDetails entries={entries} now={now} />
      <p class="board-footnote">
        Times and reporting windows use UTC. Views are recorded browser beacons,
        not a count of people.
      </p>
    </div>
  );
}

function TrafficTrend({
  rows,
}: {
  rows: { period: string; pageViews: number }[] | null;
}) {
  if (rows === null)
    return <div class="board-chart-empty">Daily trend unavailable</div>;
  if (rows.length === 0)
    return <div class="board-chart-empty">No daily readings available</div>;
  const max = Math.max(1, ...rows.map((row) => row.pageViews));
  const width = 360,
    height = 76;
  const first = rows[0].period.slice(5),
    last = rows[rows.length - 1].period.slice(5);
  return (
    <figure class="board-chart">
      <figcaption>
        Daily views <span>30 UTC days</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Daily page views from ${rows[0].period} to ${rows[rows.length - 1].period}. Highest day: ${Math.max(...rows.map((row) => row.pageViews))} views.`}
      >
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="var(--line)"
        />
        {rows.map((row, i) => (
          <rect
            key={row.period}
            x={(i * width) / rows.length + 1}
            y={height - 1 - (row.pageViews / max) * (height - 6)}
            width={Math.max(1, width / rows.length - 3)}
            height={(row.pageViews / max) * (height - 6)}
            rx="1.5"
            fill="var(--accent)"
          >
            <title>
              {row.period}: {row.pageViews} views
            </title>
          </rect>
        ))}
      </svg>
      <div class="board-chart-axis">
        <span>{first}</span>
        <span>
          {rows.every((row) => row.pageViews === 0)
            ? 'No views recorded in this window'
            : 'Daily totals · includes today'}
        </span>
        <span>{last}</span>
      </div>
    </figure>
  );
}
