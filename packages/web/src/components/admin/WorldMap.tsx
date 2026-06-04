// Choropleth of visitors by country. The vendored world-map.svg keys each
// country by lowercase ISO-3166-1 alpha-2 id (e.g. <path id="gb"> or
// <g id="gb">); MaxMind returns uppercase codes, so we lowercase when matching.
// Map asset: CC BY-SA 3.0 (Al MacDonald). Geo data: GeoLite2 (MaxMind).
import worldSvg from './world-map.svg?raw';

interface Region { country: string; count: number; }

export default function WorldMap({ regions }: { regions: Region[] }) {
  const total = regions.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...regions.map((r) => r.count));

  // Per-country fill rules. Cover both <path id> and <g id><path> shapes by
  // targeting the element and any descendant paths (wins over the base rule
  // on specificity via the id). Indigo, alpha scaled by visit share.
  const rules = regions
    .filter((r) => /^[A-Za-z]{2}$/.test(r.country)) // only valid alpha-2 ids reach the CSS selector
    .map((r) => {
      const id = r.country.toLowerCase();
      const alpha = (0.2 + 0.8 * (r.count / max)).toFixed(3);
      return `.wm-svg svg #${id}, .wm-svg svg #${id} path { fill: rgba(79,70,229,${alpha}); }`;
    })
    .join('\n');

  if (total === 0) {
    return (
      <div class="bg-surface rounded-xl border border-line shadow-sm p-8 text-center">
        <p class="text-sm text-ink-3">No geolocated visits yet. Country data is recorded only when a GeoIP database is configured on the server.</p>
      </div>
    );
  }

  return (
    <div class="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-line">
        <h3 class="font-semibold text-ink">Visitor regions</h3>
      </div>
      <div class="p-5">
        <style>{`
          .wm-svg svg { width: 100%; height: auto; display: block; }
          .wm-svg svg path, .wm-svg svg g { fill: var(--surface-2); stroke: var(--line); stroke-width: 0.3; }
          ${rules}
        `}</style>
        <div class="wm-svg" dangerouslySetInnerHTML={{ __html: worldSvg }} />

        {/* Country numbers live in the Top card's Countries tab — map is the glance. */}

        <p class="text-[11px] text-ink-4 mt-4 leading-relaxed">
          This product includes GeoLite2 data created by MaxMind, available from{' '}
          <a href="https://www.maxmind.com" class="hover:text-ink-3" target="_blank" rel="noopener noreferrer">maxmind.com</a>.
          {' '}World map: CC BY-SA 3.0, Al MacDonald.
        </p>
      </div>
    </div>
  );
}
