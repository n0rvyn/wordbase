import { DataNote, readingStatus, type Reading } from './DataNote';
import { shortUtc } from '../../lib/admin-presentation';
export function ReadingCaption({
  reading,
  now = Date.now(),
}: {
  reading: Reading<unknown>;
  now?: number;
}) {
  const status = readingStatus(reading, now);
  return (
    <div
      class={`measurement-caption ${status ? 'has-status' : ''}`}
      aria-live="polite"
    >
      {status ? (
        <>
          <span>
            {status === 'Not loaded' ? 'Loading measurement…' : status}
          </span>
          {reading.data !== null && reading.observation && (
            <small>
              Observed {shortUtc(reading.observation.observedAt)}
              {reading.error ? ' · previous value retained' : ''}
            </small>
          )}
          {reading.error && reading.observation && (
            <small>{reading.observation.range}</small>
          )}
        </>
      ) : (
        <span>Observed {shortUtc(reading.observation?.observedAt)}</span>
      )}
    </div>
  );
}
export function MeasurementDetails({
  entries,
  now = Date.now(),
}: {
  entries: { label: string; reading: Reading<unknown> }[];
  now?: number;
}) {
  const failures = entries.filter((entry) => entry.reading.error).length;
  return (
    <details class="measurement-details">
      <summary>
        <span>Data sources &amp; freshness</span>
        <small>
          {failures
            ? `${failures} unavailable source${failures === 1 ? '' : 's'}`
            : `${entries.length} measurement${entries.length===1?'':'s'}`}
          <span aria-hidden="true"> ＋</span>
        </small>
      </summary>
      <div class="measurement-details-intro">
        Refreshes every minute. A dash means unavailable, not zero. Stale values
        keep their original observation time. Exact windows and definitions are
        listed below.
      </div>
      <div class="measurement-details-grid">
        {entries.map(({ label, reading }) => (
          <section>
            <h4>{label}</h4>
            <DataNote reading={reading} now={now} />
          </section>
        ))}
      </div>
    </details>
  );
}
