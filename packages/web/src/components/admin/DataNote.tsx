import type { Observation } from '../../lib/admin-api';
export interface Reading<T> { data:T | null; observation:Observation | null; error:string | null; fetchedAt:number | null; }
export const emptyReading = <T,>():Reading<T> => ({data:null,observation:null,error:null,fetchedAt:null});
const utc = (ms:number) => new Date(ms).toISOString().slice(0,19).replace('T',' ')+' UTC';
const compactRange = (range:string) => range.replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|\+00:00)/g,'$1 $2 UTC');
export function readingStatus(reading:Reading<unknown>,now=Date.now()):string | null {
  if(reading.error) return reading.data === null ? 'Unavailable' : 'Stale · refresh failed';
  if(reading.data === null) return 'Not loaded';
  if(!reading.observation) return 'Source time unknown';
  return now >= reading.observation.expiresAt ? 'Stale snapshot' : null;
}
export function DataNote({reading, now=Date.now()}: {reading:Reading<unknown>;now?:number}) {
  const meta=reading.observation;
  return <div class="text-xs text-ink-2 break-words mt-2 mb-4 space-y-1" aria-live="polite">
    {reading.error && <p role="alert" class="text-red-600">Unavailable: {reading.error}. {reading.data !== null ? 'Last successful data retained; it is stale.' : 'No measurement available.'}</p>}
    {meta ? <>
      <p>{meta.source} · {now >= meta.expiresAt ? 'Stale snapshot · ' : ''}Observed {utc(meta.observedAt)}</p>
      <p>{compactRange(meta.range)}</p>
      <details><summary class="cursor-pointer">What this measures</summary><p>{meta.definition}</p></details>
    </> : <p>{reading.fetchedAt ? `Fetched ${utc(reading.fetchedAt)}; source timestamp unavailable.` : 'Not loaded.'}</p>}
  </div>;
}
export function Missing({name}: {name:string}) { return <div class="bg-surface border border-line rounded-xl p-6 text-sm text-ink-3">{name} unavailable. This does not mean zero.</div>; }
