import { useState, useEffect, useRef, useLayoutEffect } from 'preact/hooks';
import { adminObserved } from '../../lib/admin-api';
import { DataNote, Missing, emptyReading, readingStatus, type Reading } from './DataNote';
import WorldMap from './WorldMap';

type Period = 'daily' | 'weekly' | 'monthly';

interface VisitorSummary {
  days: number;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
}
interface TrendPoint {
  period: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
}
interface TopPage { path: string; label: string; views: number; }
interface Referrer { host: string; count: number; }
interface ShareStats { days: number; byTarget: { target: string; count: number }[]; byPage: { path: string; count: number }[]; }
interface Region { country: string; count: number; }
interface DeviceRow { type: string; count: number; }
interface EndpointStat { method: string; route: string; count: number; avgMs: number; p50Ms: number; p95Ms: number; errorRate: number; }
interface RequestMetrics {
  hours: number;
  totalRequests: number;
  errorRate: number;
  statusClass: Record<string, number>;
  endpoints: EndpointStat[];
}
interface BuildState { status: string; startedAt: number | null; completedAt: number | null; error: string | null; duration: number | null; }
interface SystemStatus {
  runtime: { uptimeSeconds: number; nodeVersion: string; memory: { rss: number; heapUsed: number; heapTotal: number } };
  database: { sizeBytes: number | null; walBytes: number | null; pageCount: number; pageSize: number; journalMode: string; tableRows: Record<string, number> };
  ops: {
    build: BuildState;
    apps: { total: number; published: number; draft: number; lastSyncedAt: number | null; recent: { name: string; status: string; lastSyncedAt: number | null }[] };
    podcast: { shows: number; showsPublished: number; episodes: number; episodesPublished: number; lastPublishedAt: number | null };
    pendingComments: number;
  };
}

interface PodcastSummary {
  days: number;
  totalDownloads: number;
  windowDownloads: number;
  subscriberEstimate: number;
  subscriberWindowDays: number;
}
interface PodcastTrendPoint { period: string; downloads: number; feedPolls: number; }
interface EpisodeDownloadRow { id: string; title: string; slug: string; episodeNumber: number | null; status: string; downloads: number; trend: number[]; }
interface SeoHealth {
  artifacts: {
    sitemap: { exists: boolean; urlCount: number; canonicalHost: string | null };
    robots: { exists: boolean };
    blogFeed: { exists: boolean };
    llmsTxt: { exists: boolean };
  };
  coverage: { postsTotal: number; postsWithAuthoredExcerpt: number; postsWithCustomCover: number };
  issues: string[];
}

// daily trends span 30 days, weekly 12 weeks, monthly 12 months — keep the
// summary window aligned with the chart so the headline numbers match the curve.
// Shares-by-channel rendered as a horizontal strip (reuses DeviceBreakdown).
const SHARE_META: Record<string, { label: string; color: string }> = {
  x: { label: 'X', color: '#6366f1' },
  native: { label: '系统分享', color: '#10b981' },
  copy: { label: '复制链接', color: '#f59e0b' },
  wechat: { label: '微信', color: '#22c55e' },
};
const TOP_DIMS = [
  { key: 'pages', label: 'Pages' },
  { key: 'referrers', label: 'Referrers' },
] as const;
type TopDim = (typeof TOP_DIMS)[number]['key'];

// alpha-2 → flag emoji (regional indicator symbols).
function countryFlag(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
const PERIOD_DAYS: Record<Period, number> = { daily: 30, weekly: 84, monthly: 365 };
const PERIOD_LABEL: Record<Period, string> = { daily: '30 UTC days · daily', weekly: '84 UTC days · weekly', monthly: '365 UTC days · monthly' };

type SeriesKey = 'pageViews' | 'uniqueVisitors' | 'sessions';
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'pageViews', label: 'Page views', color: '#4f46e5' },
  { key: 'uniqueVisitors', label: 'Estimated visitors', color: '#10b981' },
  { key: 'sessions', label: 'Page visits (30-minute buckets)', color: '#f59e0b' },
];

export default function ObservabilityPanel() {
  const [period, setPeriod] = useState<Period>('daily');
  const [tab, setTab] = useState<'audience' | 'health' | 'seo'>('audience');
  const [summary, setSummary] = useState<VisitorSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [shareStats, setShareStats] = useState<ShareStats | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [topDim, setTopDim] = useState<TopDim>('pages');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [requests, setRequests] = useState<RequestMetrics | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [podSummary, setPodSummary] = useState<PodcastSummary | null>(null);
  const [podTrends, setPodTrends] = useState<PodcastTrendPoint[]>([]);
  const [episodeTable, setEpisodeTable] = useState<EpisodeDownloadRow[]>([]);
  const [podClients, setPodClients] = useState<DeviceRow[]>([]);
  const [seoHealth, setSeoHealth] = useState<SeoHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [readings,setReadings]=useState<Record<string,Reading<unknown>>>({});
  const [now,setNow]=useState(Date.now());
  const generation=useRef(0);
  const available=(key:string)=>readings[key]?.data != null;
  const note=(key:string)=><DataNote reading={readings[key] ?? emptyReading()} now={now}/>;
  useEffect(() => {
    void loadData(period);
    const interval=setInterval(()=>{setNow(Date.now());void loadData(period);},60_000);
    return ()=>{clearInterval(interval);generation.current++;};
  },[period]);

  async function loadData(p: Period) {
    const request=++generation.current;
    setLoading(true); setError('');
    async function read<T>(key:string,path:string,set:(value:T)=>void) {
      try {
        const result=await adminObserved<T>(path);
        if(request!==generation.current) return;
        set(result.data);setReadings(previous=>({...previous,[key]:{...result,error:null,fetchedAt:Date.now()}}));
      } catch(error) {
        if(request!==generation.current) return;
        setReadings(previous=>({...previous,[key]:{...(previous[key] ?? emptyReading()),error:error instanceof Error ? error.message : 'Request failed'}}));
      }
    }
    const days=PERIOD_DAYS[p];
    await Promise.all([
      read('visits',`/api/observability/visits?days=${days}`,setSummary),
      read('trends',`/api/observability/trends?period=${p}`,setTrends),
      read('top-pages',`/api/observability/top-pages?limit=10&days=${days}`,setTopPages),
      read('referrers',`/api/observability/referrers?limit=10&days=${days}`,setReferrers),
      read('shares',`/api/observability/shares?days=${days}`,setShareStats),
      read('regions',`/api/observability/regions?days=${days}`,setRegions),
      read('devices',`/api/observability/devices?days=${days}`,setDevices),
      read('requests','/api/observability/requests?hours=24',setRequests),
      read('system','/api/observability/system',setSystem),
      read('podcast-summary',`/api/observability/podcast/summary?days=${days}`,setPodSummary),
      read('podcast-trends',`/api/observability/podcast/trends?period=${p}`,setPodTrends),
      read('podcast-episodes','/api/observability/podcast/episodes',setEpisodeTable),
      read('podcast-clients','/api/observability/podcast/clients?limit=10',setPodClients),
      read('seo-health','/api/observability/seo-health',setSeoHealth),
    ]);
    if(request===generation.current){setLoading(false);setNow(Date.now());}
  }

  // Merged "Top" card — one ranked list, switchable across incoming-traffic dims.
  const topConfig = {
    pages: { accent: '#4f46e5', empty: 'No page views yet.', rows: topPages.map((p) => ({ label: p.label || p.path, value: p.views })) },
    referrers: { accent: '#10b981', empty: 'No recorded referrers in this window.', rows: referrers.map((r) => ({ label: r.host, value: r.count })) },
  }[topDim];

  return (
    <div>
      {/* Top-level header: title + sub-tabs + (audience-only) range dropdown */}
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p class="text-sm text-ink-3 mt-0.5">Recorded audience activity · API/process health · local SEO checks. Refreshes every minute.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-lg bg-surface-2 p-1 flex-wrap">
            {(['audience', 'health', 'seo'] as const).map((t) => (
              <button
                onClick={() => setTab(t)}
                class={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-all ${
                  tab === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {t === 'audience' ? 'Audience' : t === 'health' ? 'Health' : 'SEO'}
              </button>
            ))}
          </div>
          <button onClick={()=>void loadData(period)} disabled={loading} class="border rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
          {tab === 'audience' && <RangeMenu period={period} onChange={setPeriod} />}
        </div>
      </div>

      {error && <p class="text-red-600 mb-4">{error}</p>}
      {loading && !Object.keys(readings).length ? (
        <ChartSkeleton />
      ) : (
        <>
          {tab === 'audience' && (
            <>
              {/* Summary cards with mini sparklines */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {SERIES.map((s) => (
                  <SummaryCard
                    series={s}
                    status={readingStatus(readings.visits ?? emptyReading(),now)}
                    value={summary?.[s.key]}
                    trend={trends.map((t) => t[s.key])}
                  />
                ))}
              </div>

              {note('visits')}
              <p class="text-xs text-ink-3 mb-4">Windows include the partial current UTC day. Visitors use browser IDs or IP-hash fallback and are not a people count; page visits are not whole-site sessions.</p>
              {/* Trend chart */}
              <div class="bg-surface rounded-xl border border-line shadow-sm p-5 sm:p-6 mb-5">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <h3 class="font-semibold text-ink">Trend</h3>
                  <div class="flex flex-wrap gap-x-4 gap-y-1">
                    {SERIES.map((s) => (
                      <span class="flex items-center gap-1.5 text-xs font-medium text-ink-3">
                        <span class="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
                {available('trends') ? <TrendChart data={trends} period={period} /> : <Missing name="Traffic trend"/>}{note('trends')}
              </div>

              {/* Top (pages/referrers) + devices */}
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div>{available(topDim === 'pages' ? 'top-pages' : 'referrers') ? <BarList
                  title="Top"
                  accent={topConfig.accent}
                  empty={topConfig.empty}
                  rows={topConfig.rows}
                  tabs={TOP_DIMS.map((d) => ({ key: d.key, label: d.label }))}
                  activeTab={topDim}
                  onTab={(k) => setTopDim(k as TopDim)}
                /> : <Missing name="Top traffic sources"/>}{note(topDim === 'pages' ? 'top-pages' : 'referrers')}</div>
                <div>{available('devices') ? <DeviceBreakdown rows={devices} /> : <Missing name="Device breakdown"/>}{note('devices')}</div>
              </div>

              {/* Geography row: map + country ranking */}
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div>{available('regions') ? <WorldMap regions={regions} /> : <Missing name="Geography"/>}{note('regions')}</div>
                <div>{available('regions') ? <BarList
                  title="Geolocated page views"
                  accent="#6366f1"
                  empty="No geolocated visits yet."
                  rows={regions.map((r) => ({ label: `${countryFlag(r.country)} ${r.country}`, value: r.count }))}
                /> : <Missing name="Geolocated page views"/>}{note('regions')}</div>
              </div>

              {/* Engagement: shares by channel + shares by page */}
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div>{available('shares') ? <DeviceBreakdown
                  title="Share clicks by channel"
                  empty="No share clicks recorded in this window."
                  meta={SHARE_META}
                  rows={(shareStats?.byTarget ?? []).map((s) => ({ type: s.target, count: s.count }))}
                /> : <Missing name="Share clicks by channel"/>}{note('shares')}</div>
                <div>{available('shares') ? <BarList
                  title="Share clicks by page"
                  accent="#f59e0b"
                  empty="No share clicks recorded in this window."
                  rows={(shareStats?.byPage ?? []).map((s) => ({ label: s.path, value: s.count }))}
                /> : <Missing name="Share clicks by page"/>}{note('shares')}</div>
              </div>

              {/* ---- Podcast (downloads + RSS feed polls, distinct from page-view beacons) ---- */}
              <div class="mt-10 mb-6">
                <h3 class="text-lg font-semibold text-ink tracking-tight">Podcast</h3>
                <p class="text-sm text-ink-3 mt-0.5">Deduped download requests &amp; feed activity · {PERIOD_LABEL[period]}</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <SummaryCard
                  series={{ key: 'totalDownloads', label: 'Total downloads', color: '#8b5cf6' }}
                  status={readingStatus(readings['podcast-summary'] ?? emptyReading(),now)}
                  value={podSummary?.totalDownloads}
                  trend={[]}
                />
                <SummaryCard
                  series={{ key: 'windowDownloads', label: `Downloads · ${PERIOD_LABEL[period].toLowerCase()}`, color: '#6366f1' }}
                  status={readingStatus(readings['podcast-summary'] ?? emptyReading(),now)}
                  value={podSummary?.windowDownloads}
                  trend={podTrends.map((t) => t.downloads)}
                />
                <SummaryCard
                  series={{ key: 'subscriberEstimate', label: `Feed endpoint-days (${podSummary?.subscriberWindowDays ?? 7} UTC days)`, color: '#ec4899' }}
                  status={readingStatus(readings['podcast-summary'] ?? emptyReading(),now)}
                  value={podSummary?.subscriberEstimate}
                  trend={[]}
                />
              </div>

              {note('podcast-summary')}
              {note('podcast-trends')}
              <div class="mb-5">
                {available('podcast-clients') ? <DeviceBreakdown title="Feed client activity · retained history" empty="No feed polls recorded in retained history." meta={CLIENT_META} rows={podClients} /> : <Missing name="Feed client activity"/>}
                {note('podcast-clients')}
              </div>

              {/* Episodes sorted by downloads — doubles as the top-episodes ranking */}
              {available('podcast-episodes') ? <EpisodeTable rows={[...episodeTable].sort((a, b) => b.downloads - a.downloads)} /> : <Missing name="Episode downloads"/>}{note('podcast-episodes')}
            </>
          )}

          {tab === 'health' && (
            <>
              {/* ---- API requests (server-side, distinct from the visit beacons above) ---- */}
              <div class="mb-6">
                <h3 class="text-lg font-semibold text-ink tracking-tight">API requests</h3>
                <p class="text-sm text-ink-3 mt-0.5">Server-side request timing · last 24 hours · separate from the visit beacons above</p>
              </div>
              {note('requests')}<RequestSection data={requests} />

              {/* ---- System & operations ---- */}
              <div class="mt-10 mb-6">
                <h3 class="text-lg font-semibold text-ink tracking-tight">System &amp; operations</h3>
                <p class="text-sm text-ink-3 mt-0.5">Process, database, and content-pipeline status · read-only</p>
              </div>
              {note('system')}<SystemSection data={system} />
            </>
          )}

          {tab === 'seo' && <>{note('seo-health')}<SeoHealthSection data={seoHealth} /></>}
        </>
      )}
    </div>
  );
}

/* ---------------- range dropdown (period selector) ---------------- */

function RangeMenu({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} class="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink hover:border-line-2 transition-colors"
      >
        {PERIOD_LABEL[period]}
        <svg class={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5 10 12.5 15 7.5" /></svg>
      </button>
      {open && (
        <div class="absolute right-0 z-20 mt-1.5 w-44 rounded-lg border border-line bg-surface shadow-lg p-1">
          {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
            <button
              onClick={() => { onChange(p); setOpen(false); }}
              class={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm text-left transition-colors ${
                period === p ? 'bg-surface-2 text-ink font-medium' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {PERIOD_LABEL[p]}
              {period === p && <span class="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- system & operations ---------------- */

const BUILD_META: Record<string, { label: string; dot: string; text: string }> = {
  idle: { label: 'No valid build record', dot: '#94a3b8', text: 'text-ink-2' },
  requested: { label: 'Requested', dot: '#3b82f6', text: 'text-accent' },
  building: { label: 'Building', dot: '#f59e0b', text: 'text-amber-600' },
  success: { label: 'Success', dot: '#10b981', text: 'text-emerald-600' },
  failed: { label: 'Failed', dot: '#ef4444', text: 'text-rose-600' },
};

function SystemSection({ data }: { data: SystemStatus | null }) {
  if (!data) return <div class="bg-surface rounded-xl border border-line shadow-sm p-8 text-center text-sm text-ink-3">System data unavailable.</div>;
  const { runtime, database, ops } = data;
  const build = BUILD_META[ops.build.status] ?? BUILD_META.idle;

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Runtime */}
      <Panel title="Runtime">
        <Row label="Uptime" value={fmtUptime(runtime.uptimeSeconds)} />
        <Row label="Node" value={runtime.nodeVersion} />
        <Row label="Memory (RSS)" value={fmtBytes(runtime.memory.rss)} />
        <Row label="Heap used" value={`${fmtBytes(runtime.memory.heapUsed)} / ${fmtBytes(runtime.memory.heapTotal)}`} />
      </Panel>

      {/* Database */}
      <Panel title="Database">
        <Row label="Size" value={`${fmtBytes(database.sizeBytes)} · WAL ${fmtBytes(database.walBytes)}`} />
        <Row label="Journal mode" value={database.journalMode.toUpperCase()} />
        <Row label="Pages" value={`${database.pageCount.toLocaleString()} × ${fmtBytes(database.pageSize)}`} />
        <div class="pt-2 mt-1 border-t border-line">
          <div class="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-3">
            {Object.entries(database.tableRows).map(([t, n]) => (
              <span><span class="text-ink-3">{t}</span> <span class="font-semibold text-ink-2 tabular-nums">{n.toLocaleString()}</span></span>
            ))}
          </div>
        </div>
      </Panel>

      {/* Build / deploy */}
      <Panel title="Static build">
        <div class="flex items-center justify-between py-1.5">
          <span class="text-sm text-ink-3">Status</span>
          <span class={`flex items-center gap-2 text-sm font-medium ${build.text}`}>
            <span class="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: build.dot }} />
            {build.label}
          </span>
        </div>
        {ops.build.completedAt && <Row label="Last build" value={timeAgo(ops.build.completedAt)} />}
        {ops.build.duration != null && <Row label="Duration" value={`${(ops.build.duration / 1000).toFixed(1)}s`} />}
        {ops.build.error && <p class="text-xs text-rose-500 mt-1 break-words">{ops.build.error}</p>}
      </Panel>

      {/* Content pipeline */}
      <Panel title="Content pipeline">
        <Row label="App records" value={`${ops.apps.published} published / ${ops.apps.total} total`} />
        <Row label="App last sync" value={ops.apps.lastSyncedAt ? timeAgo(ops.apps.lastSyncedAt) : '—'} />
        <Row label="Podcast" value={`${ops.podcast.episodesPublished}/${ops.podcast.episodes} episodes · ${ops.podcast.showsPublished} shows`} />
        <Row label="Last episode" value={ops.podcast.lastPublishedAt ? timeAgo(ops.podcast.lastPublishedAt) : '—'} />
        <div class="flex items-center justify-between py-1.5">
          <span class="text-sm text-ink-3">Pending comments</span>
          {ops.pendingComments > 0 ? (
            <a href="/admin/comments" class="text-sm font-semibold text-amber-600 hover:underline tabular-nums">{ops.pendingComments} →</a>
          ) : (
            <span class="text-sm font-semibold text-ink-3 tabular-nums">0</span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function SeoHealthSection({ data }: { data: SeoHealth | null }) {
  if (!data) return <Missing name="SEO snapshot"/>;
  const { artifacts, coverage, issues } = data;
  const mark = (ok: boolean) => (ok ? '✓' : '✗');
  return (
    <div class="mt-10">
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-ink tracking-tight">SEO Health</h2>
        <p class="text-sm text-ink-3 mt-0.5">Static artifacts + canonical host + content enrichment · read-only</p>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Static artifacts">
          <Row label="Sitemap" value={`${mark(artifacts.sitemap.exists)} ${artifacts.sitemap.exists ? `${artifacts.sitemap.urlCount} urls` : 'missing'}`} />
          <Row label="Robots.txt" value={`${mark(artifacts.robots.exists)} ${artifacts.robots.exists ? 'present' : 'missing'}`} />
          <Row label="RSS feed" value={`${mark(artifacts.blogFeed.exists)} ${artifacts.blogFeed.exists ? 'present' : 'missing'}`} />
          <Row label="llms.txt" value={`${mark(artifacts.llmsTxt.exists)} ${artifacts.llmsTxt.exists ? 'present' : 'missing'}`} />
        </Panel>
        <Panel title="Content enrichment">
          <Row label="Published posts" value={String(coverage.postsTotal)} />
          <Row label="Hand-authored excerpt" value={`${coverage.postsWithAuthoredExcerpt} / ${coverage.postsTotal}`} />
          <Row label="Custom cover image" value={`${coverage.postsWithCustomCover} / ${coverage.postsTotal}`} />
          <Row label="Canonical host" value={artifacts.sitemap.canonicalHost ?? '—'} />
          <p class="text-xs text-ink-3 pt-1.5">所有页面都已有自动派生的 description 与默认 OG 图；此处统计的是更强的人工撰写增强项，非"是否存在"。</p>
        </Panel>
        <div class="lg:col-span-2">
          <Panel title="Issues">
            {issues.length === 0 ? (
              <p class="text-sm text-ink-3 py-1.5">No issues</p>
            ) : (
              <ul class="space-y-1.5 py-1.5">
                {issues.map((msg) => (
                  <li class="flex items-start gap-2 text-sm text-rose-500">
                    <span class="shrink-0">⚠</span>
                    <span class="break-words">{msg}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: any }) {
  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm">
      <div class="px-5 py-4 border-b border-line"><h3 class="font-semibold text-ink">{title}</h3></div>
      <div class="px-5 py-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex items-center justify-between py-1.5 gap-4">
      <span class="text-sm text-ink-3 shrink-0">{label}</span>
      <span class="text-sm font-medium text-ink tabular-nums truncate text-right">{value}</span>
    </div>
  );
}

function fmtBytes(b: number | null): string {
  if (b === null) return 'unavailable';
  if (b >= 1 << 30) return `${(b / (1 << 30)).toFixed(2)} GB`;
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MB`;
  if (b >= 1 << 10) return `${(b / (1 << 10)).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

/* ---------------- request observability ---------------- */

const STATUS_META: Record<string, { label: string; color: string }> = {
  '2xx': { label: '2xx success', color: '#10b981' },
  '3xx': { label: '3xx redirect', color: '#3b82f6' },
  '4xx': { label: '4xx client', color: '#f59e0b' },
  '5xx': { label: '5xx server', color: '#ef4444' },
};

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  POST: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  PUT: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  PATCH: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

function RequestSection({ data }: { data: RequestMetrics | null }) {
  if (!data) return <Missing name="API request metrics"/>;
  if (data.totalRequests === 0) {
    return (
      <div class="bg-surface rounded-xl border border-line shadow-sm p-8 text-center">
        <p class="text-sm text-ink-3">0 API requests recorded in the last 24 hours. Latency and error percentage have no samples.</p>
      </div>
    );
  }

  const avgAll = data.endpoints.length
    ? data.endpoints.reduce((s, e) => s + e.avgMs * e.count, 0) / data.totalRequests
    : 0;
  const statusEntries = Object.entries(data.statusClass).filter(([, v]) => v > 0);
  const statusTotal = statusEntries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div class="bg-surface rounded-xl border border-line shadow-sm p-5">
          <p class="text-sm font-medium text-ink-3">Total requests</p>
          <p class="text-3xl font-bold text-ink tabular-nums mt-2 leading-none">{data.totalRequests.toLocaleString()}</p>
        </div>
        <div class="bg-surface rounded-xl border border-line shadow-sm p-5">
          <p class="text-sm font-medium text-ink-3">4xx + 5xx responses</p>
          <p class={`text-3xl font-bold tabular-nums mt-2 leading-none ${data.errorRate > 0 ? 'text-rose-500' : 'text-ink'}`}>
            {data.errorRate}%
          </p>
        </div>
        <div class="bg-surface rounded-xl border border-line shadow-sm p-5">
          <p class="text-sm font-medium text-ink-3">Avg latency</p>
          <p class="text-3xl font-bold text-ink tabular-nums mt-2 leading-none">{fmtMs(avgAll)}</p>
        </div>
      </div>

      {/* status distribution */}
      <div class="bg-surface rounded-xl border border-line shadow-sm p-5 mb-5">
        <h3 class="font-semibold text-ink mb-4">Status distribution</h3>
        <div class="flex h-2.5 rounded-full overflow-hidden mb-4 gap-0.5">
          {statusEntries.map(([cls, v]) => {
            const meta = STATUS_META[cls] ?? { label: cls, color: '#cbd5e1' };
            return <div style={{ width: `${(v / statusTotal) * 100}%`, backgroundColor: meta.color }} title={meta.label} />;
          })}
        </div>
        <div class="flex flex-wrap gap-x-6 gap-y-2">
          {statusEntries.map(([cls, v]) => {
            const meta = STATUS_META[cls] ?? { label: cls, color: '#cbd5e1' };
            return (
              <span class="flex items-center gap-2 text-sm">
                <span class="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                <span class="text-ink-2">{meta.label}</span>
                <span class="font-semibold text-ink tabular-nums">{v.toLocaleString()}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* endpoint table */}
      <div class="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-line">
          <h3 class="font-semibold text-ink">Endpoints</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs font-medium text-ink-3 border-b border-line">
                <th class="px-5 py-2.5 font-medium">Endpoint</th>
                <th class="px-3 py-2.5 font-medium text-right tabular-nums">Requests</th>
                <th class="px-3 py-2.5 font-medium text-right tabular-nums">p50</th>
                <th class="px-3 py-2.5 font-medium text-right tabular-nums">p95</th>
                <th class="px-5 py-2.5 font-medium text-right tabular-nums">Errors</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {data.endpoints.map((e) => (
                <tr class="hover:bg-surface-2">
                  <td class="px-5 py-2.5">
                    <span class="inline-flex items-center gap-2 min-w-0">
                      <span class={`px-1.5 py-0.5 rounded text-xs font-semibold ${METHOD_COLOR[e.method] ?? 'bg-surface-2 text-ink-2'}`}>{e.method}</span>
                      <code class="text-ink-2 truncate">{e.route}</code>
                    </span>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink-2">{e.count.toLocaleString()}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtMs(e.p50Ms)}</td>
                  <td class={`px-3 py-2.5 text-right tabular-nums ${e.p95Ms > 500 ? 'text-amber-600 font-medium' : 'text-ink-2'}`}>{fmtMs(e.p95Ms)}</td>
                  <td class={`px-5 py-2.5 text-right tabular-nums ${e.errorRate > 0 ? 'text-rose-500 font-medium' : 'text-ink-4'}`}>{e.errorRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 100) return `${Math.round(ms)}ms`;
  return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
}

/* ---------------- summary card ---------------- */

function SummaryCard({ series, value, trend, status }: { series: { key: string; label: string; color: string }; value: number | undefined; trend: number[]; status?:string|null }) {
  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm p-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: series.color }} />
          <p class="text-sm font-medium text-ink-3">{series.label}</p>
        </div>

      </div>
      <div class="flex items-end justify-between mt-2 gap-3">
        <p class="text-3xl font-bold text-ink tabular-nums leading-none">{value === undefined ? '—' : value.toLocaleString()}</p>
        <Sparkline values={trend} color={series.color} />
      </div>
      {status && <p class="text-xs text-ink-2 mt-2">{status}</p>}
    </div>
  );
}


function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const W = 96, H = 32;
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [(i / (n - 1)) * W, H - (v / max) * (H - 4) - 2] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const gid = `spark-${color.replace('#', '')}`;
  return (
    <svg width={W} height={H} class="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={color} stop-opacity="0.25" />
          <stop offset="100%" stop-color={color} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  );
}

/* ---------------- trend chart (responsive, fills width) ---------------- */

function TrendChart({ data, period }: { data: TrendPoint[]; period: Period }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  const H = 300;
  const PAD = { top: 16, right: 16, bottom: 30, left: 44 };

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(el.clientWidth || 760);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) {
    return (
      <div ref={wrapRef} class="flex items-center justify-center text-sm text-ink-3" style={{ height: `${H}px` }}>
        No data in this window.
      </div>
    );
  }

  const innerW = Math.max(10, w - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const rawMax = Math.max(1, ...data.flatMap((d) => [d.pageViews, d.uniqueVisitors, d.sessions]));
  const max = niceCeil(rawMax);
  const n = data.length;
  const xAt = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)))];
  const labelStep = Math.ceil(n / Math.max(1, Math.floor(innerW / 64)));

  function onMove(e: MouseEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const i = Math.round(((mx - PAD.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hp = hover != null ? data[hover] : null;
  const hx = hover != null ? xAt(hover) : 0;
  const tooltipLeft = Math.max(8, Math.min(w - 160, hx - 75));

  return (
    <div ref={wrapRef} class="relative w-full" style={{ height: `${H}px` }}>
      <svg width={w} height={H} class="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="area-pv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#4f46e5" stop-opacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g>
            <line x1={PAD.left} y1={yAt(t)} x2={w - PAD.right} y2={yAt(t)} style={{ stroke: 'var(--line)' }} stroke-width="1" />
            <text x={PAD.left - 8} y={yAt(t) + 3.5} text-anchor="end" font-size="10.5" style={{ fill: 'var(--ink-3)' }} class="tabular-nums">
              {abbrev(t)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {data.map((d, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text x={xAt(i)} y={H - 8} text-anchor="middle" font-size="10" style={{ fill: 'var(--ink-3)' }}>{shortLabel(d.period, period)}</text>
          ) : null
        )}

        {/* primary area (page views) */}
        {(() => {
          const pts = data.map((d, i) => [xAt(i), yAt(d.pageViews)] as [number, number]);
          const line = smoothPath(pts);
          return <path d={`${line} L ${xAt(n - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`} fill="url(#area-pv)" />;
        })()}

        {/* series lines */}
        {SERIES.map((s) => {
          const pts = data.map((d, i) => [xAt(i), yAt(d[s.key])] as [number, number]);
          return (
            <>
              <path d={smoothPath(pts)} fill="none" stroke={s.color} stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" />
              {n === 1 && <circle cx={xAt(0)} cy={yAt(data[0][s.key])} r="3.5" fill={s.color} />}
            </>
          );
        })}

        {/* hover crosshair + dots */}
        {hp && (
          <g>
            <line x1={hx} y1={PAD.top} x2={hx} y2={PAD.top + innerH} style={{ stroke: 'var(--line-2)' }} stroke-width="1" stroke-dasharray="3 3" />
            {SERIES.map((s) => (
              <circle cx={hx} cy={yAt(hp[s.key])} r="3.5" style={{ fill: 'var(--surface)' }} stroke={s.color} stroke-width="2" />
            ))}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hp && (
        <div
          class="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface backdrop-blur px-3 py-2 shadow-lg"
          style={{ left: `${tooltipLeft}px`, width: '150px' }}
        >
          <p class="text-xs font-semibold text-ink-2 mb-1">{fullLabel(hp.period, period)}</p>
          {SERIES.map((s) => (
            <div class="flex items-center justify-between text-xs py-0.5">
              <span class="flex items-center gap-1.5 text-ink-3">
                <span class="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span class="font-semibold text-ink tabular-nums">{hp[s.key].toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- bar list ---------------- */

function BarList({ title, rows, empty, accent, tabs, activeTab, onTab }: {
  title: string;
  rows: { label: string; value: number; href?: string }[];
  empty: string;
  accent: string;
  tabs?: { key: string; label: string }[];
  activeTab?: string;
  onTab?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm">
      <div class="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
        <h3 class="font-semibold text-ink">{title}</h3>
        {tabs && (
          <div class="inline-flex rounded-lg bg-surface-2 p-0.5">
            {tabs.map((t) => (
              <button
                onClick={() => onTab?.(t.key)}
                class={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === t.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="p-3 space-y-0.5">
        {rows.length === 0 ? (
          <p class="text-ink-3 text-sm px-2 py-3">{empty}</p>
        ) : (
          rows.map((r, i) => (
            <div class="group relative px-3 py-2 rounded-lg overflow-hidden hover:bg-surface-2">
              <div class="absolute inset-y-0 left-0 rounded-lg opacity-[0.10]" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: accent }} />
              <div class="relative flex items-center justify-between gap-3 text-sm">
                <span class="flex items-center gap-2.5 min-w-0">
                  <span class="text-xs font-medium text-ink-4 tabular-nums w-4 shrink-0">{i + 1}</span>
                  {r.href ? (
                    <a href={r.href} class="text-ink-2 hover:text-accent truncate">{r.label}</a>
                  ) : (
                    <span class="text-ink-2 truncate">{r.label}</span>
                  )}
                </span>
                <span class="font-semibold text-ink tabular-nums shrink-0">{r.value.toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------- episode download table (per-episode detail) ---------------- */

function EpisodeTable({ rows }: { rows: EpisodeDownloadRow[] }) {
  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-line">
        <h3 class="font-semibold text-ink">Episodes</h3>
      </div>
      {rows.length === 0 ? (
        <p class="text-ink-3 text-sm px-5 py-8 text-center">No episodes yet.</p>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs font-medium text-ink-3 border-b border-line">
                <th class="px-5 py-2.5 font-medium">Episode</th>
                <th class="px-3 py-2.5 font-medium text-right tabular-nums">Downloads</th>
                <th class="px-5 py-2.5 font-medium text-right">Last 14 days</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {rows.map((e) => (
                <tr class="hover:bg-surface-2">
                  <td class="px-5 py-2.5">
                    <span class="flex items-center gap-2 min-w-0">
                      {e.episodeNumber != null && (
                        <span class="text-xs font-medium text-ink-4 tabular-nums shrink-0">EP.{e.episodeNumber}</span>
                      )}
                      <span class="text-ink-2 truncate">{e.title}</span>
                      {e.status !== 'published' && (
                        <span class="px-1.5 py-0.5 rounded text-xs font-medium bg-surface-2 text-ink-3 shrink-0">{e.status}</span>
                      )}
                    </span>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">{e.downloads.toLocaleString()}</td>
                  <td class="px-5 py-2.5">
                    <div class="flex justify-end">
                      <Sparkline values={e.trend} color="#8b5cf6" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- device breakdown ---------------- */

const DEVICE_META: Record<string, { label: string; color: string }> = {
  desktop: { label: 'Desktop', color: '#4f46e5' },
  mobile: { label: 'Mobile', color: '#10b981' },
  bot: { label: 'Bots / crawlers', color: '#a855f7' },
  unknown: { label: 'Unknown', color: '#cbd5e1' },
};

// Color palette for podcast client labels (feed-poll UA classification).
const CLIENT_META: Record<string, { label: string; color: string }> = {
  'Apple Podcasts': { label: 'Apple Podcasts', color: '#a855f7' },
  Overcast: { label: 'Overcast', color: '#f59e0b' },
  Spotify: { label: 'Spotify', color: '#10b981' },
  'Pocket Casts': { label: 'Pocket Casts', color: '#ef4444' },
  Castro: { label: 'Castro', color: '#14b8a6' },
  '小宇宙': { label: '小宇宙', color: '#ec4899' },
  AntennaPod: { label: 'AntennaPod', color: '#3b82f6' },
  bot: { label: 'Bots / crawlers', color: '#94a3b8' },
  Other: { label: 'Other', color: '#cbd5e1' },
  unknown: { label: 'Unknown', color: '#cbd5e1' },
};

function DeviceBreakdown({ rows, title = 'Device breakdown', empty = 'No user-agent data recorded in this window.', meta: metaMap = DEVICE_META }: { rows: DeviceRow[]; title?: string; empty?:string; meta?: Record<string, { label: string; color: string }> }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm">
      <div class="px-5 py-4 border-b border-line">
        <h3 class="font-semibold text-ink">{title}</h3>
      </div>
      <div class="p-5">
        {total === 0 ? (
          <p class="text-ink-3 text-sm">{empty}</p>
        ) : (
          <>
            <div class="flex h-2.5 rounded-full overflow-hidden mb-4 gap-0.5">
              {rows.map((r) => {
                const meta = metaMap[r.type] ?? { label: r.type, color: '#cbd5e1' };
                return <div style={{ width: `${(r.count / total) * 100}%`, backgroundColor: meta.color }} title={meta.label} />;
              })}
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {rows.map((r) => {
                const meta = metaMap[r.type] ?? { label: r.type, color: '#cbd5e1' };
                const pct = ((r.count / total) * 100).toFixed(1);
                return (
                  <div class="flex items-center gap-2.5">
                    <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                    <div class="min-w-0">
                      <p class="text-sm text-ink-2 truncate">{meta.label}</p>
                      <p class="text-xs text-ink-3 tabular-nums">{r.count.toLocaleString()} · {pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function ChartSkeleton() {
  return (
    <div class="animate-pulse">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {[0, 1, 2].map(() => <div class="h-24 bg-surface-2 rounded-xl" />)}
      </div>
      <div class="h-72 bg-surface-2 rounded-xl" />
    </div>
  );
}

// Smooth a polyline into a Catmull-Rom → cubic-bezier path.
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// Round an axis max up to a clean 1 / 2 / 5 × 10^k value.
function niceCeil(v: number): number {
  if (v <= 5) return Math.max(1, Math.ceil(v));
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function abbrev(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function shortLabel(period: string, _mode: Period): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period.slice(5); // 06-01
  if (/^\d{4}-W\d+$/.test(period)) return 'W' + period.slice(6);
  if (/^\d{4}-\d{2}$/.test(period)) return period; // 2026-06
  return period;
}

function fullLabel(period: string, mode: Period): string {
  if (mode === 'weekly' && /^\d{4}-W\d+$/.test(period)) return `Week ${period.slice(6)}, ${period.slice(0, 4)}`;
  return period;
}
