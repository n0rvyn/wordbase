import { cacheObservation } from '../lib/ttl-cache.js';
import { reportingWindow, PERIOD_DAYS } from '../lib/reporting.js';

export function observation(section: string, options: { days?: number; period?: string; limit?: number; hours?: number } = {}) {
  const { days = 30, period = 'daily', limit = 10, hours = 24 } = options;
  const keys: Record<string,string> = {
    'post-metrics':`postMetrics:${days}:${period}`, 'data-quality':`dataQuality:${days}`, visits:`visitorSummary:${days}`, trends:`visitTrends:${period}`,
    'top-pages':`topPages:${limit}:${options.days ?? 'all'}`, referrers:`referrers:${limit}:${options.days ?? 'all'}`,
    shares:`shareStats:${days}`, regions:`regions:${days}`, devices:`deviceBreakdown:${days}`,
    requests:`requestMetrics:${hours}`, system:'systemStatus', 'seo-health':'seoHealth',
    'podcast-summary':`podcastSummary:${days}`, 'podcast-trends':`podcastTrends:${period}`,
    'podcast-episodes':'episodeDownloadTable:14', 'podcast-clients':`podcastClients:${limit}`,
  };
  const hit=cacheObservation(keys[section]);
  const observedAt=hit?.observedAt ?? Date.now();
  let range='Current database snapshot';
  const windowed=['visits','shares','regions','devices','data-quality','post-metrics'].includes(section) || (['top-pages','referrers'].includes(section) && options.days !== undefined);
  if(windowed || ['trends','podcast-trends'].includes(section)) {
    const window=reportingWindow(['trends','podcast-trends'].includes(section) ? PERIOD_DAYS[period] ?? 30 : days,observedAt);
    range=`${new Date(window.from*1000).toISOString()} to ${new Date(window.to*1000).toISOString()} (UTC; end exclusive)`;
  }
  if(['top-pages','referrers','top-posts','podcast-top-episodes'].includes(section) && options.days === undefined) range='All recorded history';
  if(section==='requests') range=`Last ${hours} hours ending ${new Date(observedAt).toISOString()}`;
  if(section==='podcast-summary') range=`Lifetime downloads; ${days} UTC days including today for selected downloads; 7 UTC days for feed endpoint-days`;
  if(section==='podcast-episodes') range='Lifetime downloads; 14-day activity sparklines';
  if(section==='podcast-clients') range='Recorded feed-poll history; retention approximately 90 days';
  if(section==='overview') range='All recorded views; today starts at 00:00 UTC; current published-post count';
  if(section==='content') range='Current counts; monthly creation history and tag distribution';
  const podcast=section.startsWith('podcast');
  let source=podcast ? 'SQLite podcast events' : ['system','content','comment-counts','posts'].includes(section) ? 'SQLite content and runtime state' : section==='seo-health' ? 'Built files and SQLite content' : section==='requests' ? 'Recorded API requests' : 'Recorded browser pageview beacons';
  let definition='Page views exclude recognized bot user agents. Browser IDs approximate visitors; usable IP hashes are the fallback. Common historical unknown/loopback hashes are excluded; other historical proxy-derived hashes cannot be verified. Page visits deduplicate visitor + exact path + fixed 30-minute bucket; they are not whole-site sessions. Missing/blocked beacons and unidentified bots limit coverage.';
  if(section==='post-metrics') { source='SQLite article beacons, share clicks and current local redirect mappings'; definition='Exact article matching combines default/English routes, encoded and .html variants and known internal redirects. Views exclude recognized bots. Visitors are estimates, known invalid IP fallbacks are excluded, unique visitors are not additive. Share clicks are raw events, not confirmed shares. Country coverage does not verify proxy trust or identify people.'; }
  if(section==='data-quality') { source='SQLite event coverage and collection state'; definition='Single snapshot of captured and excluded events, identity/geography/referrer coverage and retained event timestamps. Event time is distinct from snapshot refresh time. Common unknown/loopback IP hashes are excluded from identity coverage without rewriting stored rows. Missing beacons, expected traffic and external uptime are not measured.'; }
  if(section==='shares') { source='Recorded share-button clicks'; definition='Clicks only; successful sharing or recipient delivery is not measured.'; }
  if(section==='regions') definition='Geolocated page views, not unique people. Unknown countries are excluded; results depend on GeoIP and trusted client-IP forwarding.';
  if(section==='trends') definition += ' Unique visitors are computed independently per bucket and must not be summed to obtain selected-window visitors.';
  if(section==='top-pages') definition += ` Ranks at most ${limit} public paths; admin/API paths are excluded defensively. A limited ranking does not sum to all page views.`;
  if(section==='referrers') definition = `Top ${limit} received referrer hosts among bot-filtered page views. Missing referrers are direct or unattributed, not proven direct visits. The limited ranking describes a subset of captured traffic.`;
  if(section==='devices') definition='Recorded pageviews classified by user agent; includes bots and unknown devices.';
  if(podcast) definition='Identifiable download requests deduplicate IP + episode + fixed 30-minute bucket; not listens. Common historical unknown/loopback IP keys are excluded. Missing keys can make captured requests unmeasurable; use data-quality for their raw counts. Feed endpoint-days deduplicate IP + UTC day; not unique subscribers. Missing/trusted client-IP data and automated feed polling affect these counts.';
  if(section==='requests') definition='Matched API routes only; excludes health checks, observability reads, uploads and unmatched routes. Error percentage includes 4xx and 5xx; server and client response counts are also separated. Latency percentiles use the whole measured request sample and nearest rank, not endpoint averages. No requests means no measured latency; this is not public-site uptime.';
  if(section==='system') definition='API process, database and stored build/sync status. Public reachability, TLS and backup verification are not measured here. Last successful sync does not prove all apps are current. Counts are database records; published apps may be unlisted. Legacy idle build status means no valid build record, not a health check.';
  if(section==='seo-health') definition='Local artifact presence and authored enrichment; not a crawler/indexing or live reachability check.';
  if(section==='comment-counts') definition='All comments in the database, grouped by status; not limited to recent posts or a page of results.';
  if(section==='content' || section==='posts') definition='Database content records; draft/published status is distinct from successful static publication.';
  return { observedAt, expiresAt:hit?.expires ?? observedAt+60_000, source, range, timezone:'UTC', definition };
}
