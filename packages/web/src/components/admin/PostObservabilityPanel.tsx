import { useMemo, useState } from 'preact/hooks';
import { shortUtc } from '../../lib/admin-presentation';
export interface ArticleMeasurement {
  id: string;
  slug: string;
  title: string;
  publishedAt: number | null;
  views: number;
  estimatedVisitors: number;
  identifiedViews: number;
  unidentifiedViews: number;
  ipFallbackViews: number;
  botViews: number;
  geolocatedViews: number;
  unlocatedViews: number;
  referrerViews: number;
  unattributedViews: number;
  lastViewedAt: number | null;
  aliasViews: number;
  localeViews: { default: number; en: number };
  shareClicks: number;
  trend: { period: string; views: number }[];
  referrers: { host: string; views: number }[];
  countries: { country: string; views: number }[];
}
export interface PostMeasurements {
  days: number;
  period: string;
  window: { from: number; to: number };
  unmatchedArticleViews: number;
  rows: ArticleMeasurement[];
}
const n = (value: number) => value.toLocaleString();
const when = (seconds: number | null) =>
  seconds === null ? 'None in this window' : shortUtc(seconds * 1000);
export default function PostObservabilityPanel({
  data,
}: {
  data: PostMeasurements | null;
}) {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [order, setOrder] = useState('views');
  const rows = useMemo(
    () =>
      data?.rows
        .filter((p) =>
          `${p.title} ${p.slug}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          order === 'recent'
            ? (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
            : b.views - a.views,
        ) ?? [],
    [data, search, order],
  );
  if (!data)
    return (
      <div class="quality-missing">
        <h3>Article measurements unavailable</h3>
        <p>
          No conclusions can be drawn about article activity until this source
          returns.
        </p>
      </div>
    );
  const article = rows.find((p) => p.id === selected) ?? rows[0] ?? null;
  const viewed = data.rows.filter((p) => p.views > 0).length;
  return (
    <div class="post-observe">
      <div class="post-observe-context">
        <p>
          <strong>{data.days} UTC days</strong> · {when(data.window.from)} →{' '}
          {when(data.window.to - 1)}
        </p>
        <p>
          Received page loads, with recognized bots excluded. Default and
          English routes and known historical redirects are combined by article.
        </p>
      </div>
      <div class="post-observe-summary">
        <div>
          <span>Published articles</span>
          <strong>{n(data.rows.length)}</strong>
        </div>
        <div>
          <span>Articles with captured views</span>
          <strong>{n(viewed)}</strong>
        </div>
        <div>
          <span>Counted article views</span>
          <strong>
            {n(data.rows.reduce((total, p) => total + p.views, 0))}
          </strong>
        </div>
      </div>
      {data.unmatchedArticleViews > 0 && (
        <p class="board-alert">
          {n(data.unmatchedArticleViews)} bot-filtered article-route views could
          not be matched to a current article or known redirect. They are
          excluded from the article totals below.
        </p>
      )}
      <div class="post-observe-controls">
        <label>
          Find an article
          <input
            type="search"
            value={search}
            placeholder="Title or slug"
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
        <label>
          Order
          <select
            value={order}
            onChange={(event) => setOrder(event.currentTarget.value)}
          >
            <option value="views">Most captured views</option>
            <option value="recent">Newest published</option>
          </select>
        </label>
        <span>
          {rows.length} of {data.rows.length} articles
        </span>
      </div>
      <div class="post-observe-workspace">
        <section class="post-observe-list" aria-labelledby="articles-heading">
          <h3 id="articles-heading">Which articles are being loaded?</h3>
          <p>Choose an article for its activity and coverage.</p>
          <div class="post-observe-list-head" aria-hidden="true">
            <span>Article</span>
            <span>Views</span>
          </div>
          {rows.length === 0 ? (
            <p class="board-empty">
              {data.rows.length === 0
                ? 'No published articles in this snapshot.'
                : 'No matching articles.'}
            </p>
          ) : (
            rows.map((p) => (
              <button
                key={p.id}
                aria-pressed={article?.id === p.id}
                onClick={() => {
                  setSelected(p.id);
                  if (window.matchMedia('(max-width:1000px)').matches)
                    requestAnimationFrame(() =>
                      document
                        .getElementById('article-measurements')
                        ?.scrollIntoView({ block: 'start' }),
                    );
                }}
                class={article?.id === p.id ? 'selected' : ''}
              >
                <span>
                  <strong>{p.title}</strong>
                  <small>
                    {p.views === 0
                      ? 'No captured views in this window'
                      : `Latest captured view: ${when(p.lastViewedAt)}`}
                  </small>
                </span>
                <b>{n(p.views)}</b>
              </button>
            ))
          )}
        </section>
        {article && (
          <section
            class="post-observe-detail"
            id="article-measurements"
            aria-label="Selected article measurements"
          >
            <header>
              <p>Selected article</p>
              <h3>{article.title}</h3>
              <a
                href={`/posts/${encodeURIComponent(article.slug)}`}
                target="_blank"
                rel="noopener"
              >
                Open article ↗
              </a>
            </header>
            <div class="post-detail-metrics">
              <div>
                <span>Counted views</span>
                <strong>{n(article.views)}</strong>
              </div>
              <div>
                <span>Estimated visitors</span>
                <strong>
                  {article.views > 0 && article.identifiedViews === 0
                    ? '—'
                    : n(article.estimatedVisitors)}
                </strong>
                {article.views > 0 && article.identifiedViews === 0 && (
                  <small class="post-estimate-note">No identifier sample</small>
                )}
              </div>
              <div>
                <span>Share clicks</span>
                <strong>{n(article.shareClicks)}</strong>
              </div>
            </div>
            <p class="post-observe-note">
              Views are page loads, not completed reads. Visitors use browser
              IDs or usable IP fallbacks; shares are button clicks, with no
              completion or bot-filter guarantee.
            </p>
            <section class="post-detail-section">
              <h4>When was it loaded?</h4>
              <ArticleActivity rows={article.trend} />
              <p>
                Latest counted view: {when(article.lastViewedAt)}. Zero buckets
                mean no captured view, not proof of no readers.
              </p>
            </section>
            <section class="post-detail-section">
              <h4>Which version was loaded?</h4>
              <dl>
                <div>
                  <dt>Default route</dt>
                  <dd>{n(article.localeViews.default)}</dd>
                </div>
                <div>
                  <dt>English route</dt>
                  <dd>{n(article.localeViews.en)}</dd>
                </div>
                <div>
                  <dt>Via known historic aliases</dt>
                  <dd>{n(article.aliasViews)}</dd>
                </div>
              </dl>
              <p>
                Route language does not prove the article was translated. Alias
                views are included above, not added again.
              </p>
            </section>
            <section class="post-detail-section">
              <h4>How complete are these measurements?</h4>
              <dl>
                <div>
                  <dt>Views with an identifier</dt>
                  <dd>
                    {n(article.identifiedViews)} / {n(article.views)}
                  </dd>
                </div>
                <div>
                  <dt>IP fallback only</dt>
                  <dd>{n(article.ipFallbackViews)}</dd>
                </div>
                <div>
                  <dt>Views without an identifier</dt>
                  <dd>{n(article.unidentifiedViews)}</dd>
                </div>
                <div>
                  <dt>Recognized bot loads excluded</dt>
                  <dd>{n(article.botViews)}</dd>
                </div>
              </dl>
              <p>
                Common historic unknown/loopback IP hashes are excluded from
                identification. Other proxy-derived historical hashes cannot be
                validated or recovered. Visitor totals are estimates.
              </p>
            </section>
            <section class="post-detail-section">
              <h4>Where did the captured traffic come from?</h4>
              <p>
                Referrer present on {n(article.referrerViews)} /{' '}
                {n(article.views)} views. {n(article.unattributedViews)} are
                direct or unattributed.
              </p>
              {article.referrers.length > 0 ? (
                <dl>
                  {article.referrers.map((r) => (
                    <div key={r.host}>
                      <dt>{r.host}</dt>
                      <dd>{n(r.views)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>No referrer hosts captured in this window.</p>
              )}
              <p>
                Top five hosts; missing referrers do not prove direct visits.
              </p>
            </section>
            <details class="post-detail-section">
              <summary>
                Country coverage · {n(article.geolocatedViews)} /{' '}
                {n(article.views)} views
              </summary>
              <p>
                Country is inferred from the forwarded IP. The shared-proxy path
                has a documented historical limitation; current end-client
                attribution is not independently verified by this view.
              </p>
              {article.countries.length > 0 ? (
                <dl>
                  {article.countries.map((r) => (
                    <div key={r.country}>
                      <dt>{r.country}</dt>
                      <dd>{n(r.views)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>No country data captured.</p>
              )}
              <p>
                {n(article.unlocatedViews)} views have no country. A country
                code or loaded GeoIP reader does not establish a real visitor’s
                location.
              </p>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
function ArticleActivity({
  rows,
}: {
  rows: { period: string; views: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <figure class="post-activity">
      <figcaption>Counted views per UTC bucket</figcaption>
      <div
        class="post-activity-bars"
        role="img"
        aria-label={
          rows.every((r) => r.views === 0)
            ? 'No captured views in the selected window'
            : rows.map((r) => `${r.period}: ${r.views} views`).join('; ')
        }
      >
        {rows.map((r) => (
          <div key={r.period} title={`${r.period}: ${r.views} views`}>
            <span style={{ height: `${(r.views / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div class="post-activity-axis">
        <span>{rows[0]?.period}</span>
        <span>{rows.at(-1)?.period}</span>
      </div>
    </figure>
  );
}
