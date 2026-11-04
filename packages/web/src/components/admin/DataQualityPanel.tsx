import { shortUtc } from '../../lib/admin-presentation';
export interface DataQuality {
  days: number;
  window: { from: number; to: number };
  geoipReady: boolean;
  browser: {
    captured: number;
    counted: number;
    excludedBots: number;
    browserIdRows: number;
    ipFallbackRows: number;
    unidentifiedRows: number;
    unknownUserAgentRows: number;
    usableIpRows?: number;
    unusableIpRows?: number;
    geolocatedRows: number;
    unlocatedRows: number;
    withReferrerRows: number;
    withoutReferrerRows: number;
    lastCountedAt: number | null;
  };
  podcast: {
    downloadRequests: number;
    unidentifiableDownloads: number;
    feedRequests: number;
    unidentifiableFeedPolls: number;
  };
  sources: {
    key: string;
    label: string;
    windowEvents: number;
    firstRetainedAt: number | null;
    lastRetainedAt: number | null;
    retention: string;
  }[];
  limitations: string[];
}
const n = (v: number) => v.toLocaleString();
export function coverage(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : 'No sample';
}
const eventTime = (value: number | null) =>
  value === null ? 'No retained event' : shortUtc(value * 1000);
export default function DataQualityPanel({
  data,
}: {
  data: DataQuality | null;
}) {
  if (!data)
    return (
      <section class="quality-missing">
        <h3>Collection coverage unavailable</h3>
        <p>
          No coverage conclusions can be drawn until this source returns. Other
          available panels remain usable.
        </p>
      </section>
    );
  const b = data.browser,
    p = data.podcast;
  return (
    <div class="quality-view">
      <section class="quality-accounting" aria-labelledby="accounting-title">
        <div class="quality-section-heading">
          <div>
            <h3 id="accounting-title">What the audience count includes</h3>
            <p>
              {data.days} UTC days · {eventTime(data.window.from)} →{' '}
              {eventTime(data.window.to - 1)}
            </p>
          </div>
          <span class="quality-tag">One database snapshot</span>
        </div>
        <div class="quality-equation">
          <div>
            <span>Captured beacons</span>
            <strong>{n(b.captured)}</strong>
          </div>
          <span aria-hidden="true">−</span>
          <div>
            <span>Recognized bots</span>
            <strong>{n(b.excludedBots)}</strong>
          </div>
          <span aria-hidden="true">=</span>
          <div>
            <span>Counted page views</span>
            <strong>{n(b.counted)}</strong>
          </div>
        </div>
        <p>
          Counts above reconcile within one snapshot. Other panels refresh
          independently and can differ while new events arrive. Browser blockers
          and lost requests cannot be counted.
        </p>
        <p class="quality-event-note">
          Latest counted beacon in this window:{' '}
          <strong>
            {b.lastCountedAt === null
              ? 'None recorded'
              : eventTime(b.lastCountedAt)}
          </strong>
        </p>
      </section>
      <div class="quality-grid">
        <section class="quality-card">
          <div class="quality-card-heading">
            <h3>Visitor identification</h3>
            <strong>
              {coverage(b.browserIdRows + b.ipFallbackRows, b.counted)}
            </strong>
          </div>
          <p>
            Of counted views have an identifier. This is coverage by event, not
            a percentage of known people.
          </p>
          <dl>
            <div>
              <dt>Browser ID available</dt>
              <dd>{n(b.browserIdRows)}</dd>
            </div>
            <div>
              <dt>IP hash fallback only</dt>
              <dd>{n(b.ipFallbackRows)}</dd>
            </div>
            <div>
              <dt>No usable identifier</dt>
              <dd>{n(b.unidentifiedRows)}</dd>
            </div>
          </dl>
          <aside>
            {b.unidentifiedRows > 0
              ? `${n(b.unidentifiedRows)} counted views cannot contribute to estimated visitors or page visits. `
              : ''}
            Shared or forwarded IPs can merge visitors. Unique visitors must not
            be added across daily or weekly buckets.
          </aside>
        </section>
        <section class="quality-card">
          <div class="quality-card-heading">
            <h3>Country coverage</h3>
            <strong>{coverage(b.geolocatedRows, b.counted)}</strong>
          </div>
          <p>
            The map covers {n(b.geolocatedRows)} of {n(b.counted)} counted page
            views. {n(b.unlocatedRows)} have no country.
          </p>
          <dl>
            <div>
              <dt>GeoIP reader now</dt>
              <dd>{data.geoipReady ? 'Loaded' : 'Not loaded'}</dd>
            </div>
            <div>
              <dt>Structurally usable IP keys</dt>
              <dd>
                {typeof b.usableIpRows === 'number'
                  ? `${n(b.usableIpRows)} / ${n(b.counted)}`
                  : 'Not provided'}
              </dd>
            </div>
            <div>
              <dt>Missing / known invalid IP keys</dt>
              <dd>
                {typeof b.unusableIpRows === 'number'
                  ? n(b.unusableIpRows)
                  : 'Not provided'}
              </dd>
            </div>
            <div>
              <dt>Geolocated views</dt>
              <dd>{n(b.geolocatedRows)}</dd>
            </div>
            <div>
              <dt>Unlocated views</dt>
              <dd>{n(b.unlocatedRows)}</dd>
            </div>
          </dl>
          <aside>
            {data.geoipReady
              ? 'Browser IDs do not supply location. A usable IP hash or loaded reader does not prove end-client attribution; other historical proxy-derived hashes remain unverifiable.'
              : 'Check GeoIP initialization if country collection is expected. Earlier events are not backfilled automatically.'}
          </aside>
        </section>
        <section class="quality-card">
          <div class="quality-card-heading">
            <h3>Source attribution</h3>
            <strong>{coverage(b.withReferrerRows, b.counted)}</strong>
          </div>
          <p>
            Of counted page views carry a referrer. The referrer ranking only
            describes this subset.
          </p>
          <dl>
            <div>
              <dt>Referrer present</dt>
              <dd>{n(b.withReferrerRows)}</dd>
            </div>
            <div>
              <dt>Direct or unattributed</dt>
              <dd>{n(b.withoutReferrerRows)}</dd>
            </div>
            <div>
              <dt>Missing user agent</dt>
              <dd>{n(b.unknownUserAgentRows)}</dd>
            </div>
          </dl>
          <aside>
            No referrer does not prove a direct visit. Browser privacy policies
            and apps can omit it. Unrecognized bots may remain counted.
          </aside>
        </section>
        <section class="quality-card">
          <div class="quality-card-heading">
            <h3>Podcast deduplication</h3>
            <span class="quality-tag">Raw requests</span>
          </div>
          <p>
            Same selected window. Multiple range/download requests can become
            one deduplicated download; they are not completed listens.
          </p>
          <dl>
            <div>
              <dt>Download requests captured</dt>
              <dd>{n(p.downloadRequests)}</dd>
            </div>
            <div>
              <dt>Missing IP or episode</dt>
              <dd>{n(p.unidentifiableDownloads)}</dd>
            </div>
            <div>
              <dt>Feed polls captured</dt>
              <dd>{n(p.feedRequests)}</dd>
            </div>
            <div>
              <dt>Feed polls without IP</dt>
              <dd>{n(p.unidentifiableFeedPolls)}</dd>
            </div>
          </dl>
          <aside>
            Requests missing their deduplication key are excluded from download
            or endpoint-day estimates. Feed endpoint-days are not subscribers.
          </aside>
        </section>
      </div>
      <section class="quality-sources">
        <div class="quality-section-heading">
          <div>
            <h3>Collection timeline</h3>
            <p>
              Event timestamps below describe retained records, not when this
              page refreshed.
            </p>
          </div>
        </div>
        <div
          class="quality-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Collection timeline; scroll horizontally for all columns"
        >
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Raw events in window</th>
                <th>Latest retained event</th>
                <th>Earliest retained event</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.key}>
                  <th scope="row">
                    {s.label}
                    <small>{s.retention}</small>
                  </th>
                  <td>{n(s.windowEvents)}</td>
                  <td>{eventTime(s.lastRetainedAt)}</td>
                  <td>{eventTime(s.firstRetainedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A zero means no retained events in the selected window. Quiet
          collection is not an outage diagnosis. Retention limits mean older
          history can be incomplete.
        </p>
      </section>
      <details class="quality-limits">
        <summary>Measurement limits &amp; what to check next</summary>
        <ul>
          {data.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p>
          If expected browser activity stops appearing, check the public beacon
          request in browser network tools and API ingestion. Check client-IP
          forwarding before interpreting IP-based estimates. Use an external
          monitor for public reachability and TLS; none is configured or
          measured by this view.
        </p>
      </details>
    </div>
  );
}
