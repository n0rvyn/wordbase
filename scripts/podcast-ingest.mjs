#!/usr/bin/env node
// Podcast ingest — upload audio + upsert episodes for the 拾余光 show from a local
// media directory. Idempotent and safe to re-run: a local JSON state file records
// what has been uploaded so audio is never re-sent and episodes are never duplicated.
//
// Usage:
//   WORDBASE_API_KEY=… node scripts/podcast-ingest.mjs            # full run
//   WORDBASE_API_KEY=… node scripts/podcast-ingest.mjs --dry-run  # plan only, no network
//   WORDBASE_API_KEY=… node scripts/podcast-ingest.mjs --only 03  # one episode
//   WORDBASE_API_KEY=… node scripts/podcast-ingest.mjs --no-build # skip the final rebuild
//
// Env overrides: PODCAST_MEDIA_DIR, WORDBASE_API_URL.
//
// Media directory layout (one set per episode, NN = zero-padded number):
//   NN_<title>[_YYYY-MM-DD].{mp3,m4a,wav}   ← audio
//   NN_<title>[_YYYY-MM-DD].{md,txt}         ← full transcript
//   NN.summary.txt                           ← 2-line grey blurb (generated separately)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MEDIA_DIR = process.env.PODCAST_MEDIA_DIR || join(homedir(), 'Downloads/AI-Audios/00-Prod-Podcasts');
const API = (process.env.WORDBASE_API_URL || 'https://norvyn.com/api').replace(/\/$/, '');
const KEY = process.env.WORDBASE_API_KEY;
const SHOW_SLUG = '拾余光';
const STATE_PATH = join(MEDIA_DIR, '.ingest-state.json');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_BUILD = argv.includes('--no-build');
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; })();

if (!KEY) { console.error('✗ WORDBASE_API_KEY is not set'); process.exit(1); }
if (!existsSync(MEDIA_DIR)) { console.error(`✗ media dir not found: ${MEDIA_DIR}`); process.exit(1); }

// EP.1 / EP.2 already exist on prod WITH audio. Route them by their known id so the
// upsert-by-external path can never create a duplicate of them on the first run.
const PRESEED = {
  '01': { episodeId: 'vFf_9WbOgWVNcId1XgpUD', audioUrl: '/uploads/2026/06/01____________2026-05-13_b5ZoBk82.mp3', audioUploaded: true },
  '02': { episodeId: 'gG63L219q8KPmIXOuISAx', audioUrl: '/uploads/2026/06/02_NVIDIA____AI____2026-05-15_lg96rMpG.mp3', audioUploaded: true },
};

const AUDIO_MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg' };
const TEXT_EXT = new Set(['md', 'txt']);

const enc = encodeURIComponent;
const slugPath = enc(SHOW_SLUG);

function loadState() {
  if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  return { show: SHOW_SLUG, episodes: structuredClone(PRESEED) };
}
function saveState(s) {
  if (DRY) return;
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n');
}

// Discover episode assets: NN -> { audio, audioExt, text } from filenames like
// "07_笨拙的AI时代_2026-05-19.mp3". The summary sidecar "NN.summary.txt" has a dot
// (not underscore) after the number, so it is intentionally excluded here.
function discover() {
  const eps = {};
  for (const f of readdirSync(MEDIA_DIR)) {
    const m = f.match(/^(\d{2})_(.+)\.([a-zA-Z0-9]+)$/);
    if (!m) continue;
    const [, nn, , extRaw] = m;
    const ext = extRaw.toLowerCase();
    eps[nn] ??= { nn };
    if (AUDIO_MIME[ext]) { eps[nn].audio = f; eps[nn].audioExt = ext; }
    else if (TEXT_EXT.has(ext)) { eps[nn].text = f; }
  }
  return eps;
}

function deriveTitle(filename) {
  const stem = filename.replace(/\.[^.]+$/, '');           // drop extension
  return stem.replace(/^\d{2}_/, '').replace(/_\d{4}-\d{2}-\d{2}$/, '').trim();
}

// publishedAt (unix seconds): prefer an explicit _YYYY-MM-DD suffix in the filename
// (08:00 local, the show's morning cadence); fall back to the audio file's mtime.
function derivePublishedAt(filename, audioPath) {
  const m = filename.match(/_(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return Math.floor(new Date(`${y}-${mo}-${d}T08:00:00+08:00`).getTime() / 1000);
  }
  return Math.floor(statSync(audioPath).mtimeMs / 1000);
}

function probeDuration(audioPath) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath], { encoding: 'utf8' });
    const secs = parseFloat(out.trim());
    return Number.isFinite(secs) ? Math.round(secs) : undefined;
  } catch {
    return undefined; // ffprobe absent or unreadable — duration is optional
  }
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}

async function uploadAudio(filename, ext) {
  const buf = readFileSync(join(MEDIA_DIR, filename));
  const body = { filename, base64: buf.toString('base64'), mimeType: AUDIO_MIME[ext] };
  const r = await api('POST', `/podcasts/${slugPath}/episodes/audio`, body);
  return r; // { url, size, mimeType }
}

async function main() {
  const state = loadState();
  state.episodes ??= {};
  const assets = discover();
  let numbers = Object.keys(assets).sort();           // ascending 01..17
  if (ONLY) numbers = numbers.filter(n => n === ONLY.padStart(2, '0'));
  if (numbers.length === 0) { console.error('✗ no episodes discovered'); process.exit(1); }

  console.log(`${DRY ? '[DRY] ' : ''}ingesting ${numbers.length} episode(s) from ${MEDIA_DIR}\n`);
  let changed = 0;
  const failures = [];

  for (const nn of numbers) {
    const a = assets[nn];
    const st = (state.episodes[nn] ??= {});
    const epNum = parseInt(nn, 10);

    // ---- guards: never push an episode missing audio, transcript, or summary ----
    if (!a.audio) { failures.push(`${nn}: no audio file`); continue; }
    if (!a.text) { failures.push(`${nn}: no transcript file`); continue; }
    const summaryPath = join(MEDIA_DIR, `${nn}.summary.txt`);
    if (!existsSync(summaryPath)) { failures.push(`${nn}: missing ${nn}.summary.txt`); continue; }
    const summary = readFileSync(summaryPath, 'utf8').trim();
    if (!summary) { failures.push(`${nn}: empty summary sidecar`); continue; }

    const transcript = readFileSync(join(MEDIA_DIR, a.text), 'utf8');
    const title = deriveTitle(a.audio);
    const audioPath = join(MEDIA_DIR, a.audio);
    const audioStat = statSync(audioPath);
    const audioMtime = Math.floor(audioStat.mtimeMs);
    const publishedAt = derivePublishedAt(a.audio, audioPath);
    const duration = probeDuration(audioPath);

    // ---- audio: upload once; reuse the stored URL when the file is unchanged ----
    let audioUrl = st.audioUrl;
    let audioSize = st.audioSize ?? audioStat.size;
    // Skip upload when the audio is already on the server. A recorded mtime that no
    // longer matches means the local file was replaced → re-upload. Preseeded entries
    // (EP.1/EP.2) carry no mtime; trust their audioUploaded flag and never re-send.
    const needUpload = !st.audioUploaded || !st.audioUrl || (st.audioMtime !== undefined && st.audioMtime !== audioMtime);
    if (needUpload) {
      if (DRY) {
        console.log(`${nn} ▸ would upload audio ${a.audio} (${(audioStat.size / 1048576).toFixed(1)} MB, ${audioType})`);
        audioUrl = audioUrl || '/uploads/(dry-run)';
      } else {
        process.stdout.write(`${nn} ▸ uploading audio ${a.audio} (${(audioStat.size / 1048576).toFixed(1)} MB) … `);
        try {
          const up = await uploadAudio(a.audio, a.audioExt);
          audioUrl = up.url; audioSize = up.size;
          st.audioUrl = audioUrl; st.audioSize = audioSize; st.audioMtime = audioMtime; st.audioUploaded = true;
          saveState(state);
          console.log(`ok → ${audioUrl}`);
        } catch (e) { console.log('FAILED'); failures.push(`${nn}: audio upload — ${e.message}`); continue; }
      }
    } else {
      console.log(`${nn} ▸ audio unchanged, reuse ${st.audioUrl}`);
    }

    // audioType must describe the file actually served. For a reused preseed URL the
    // served file can differ from the local source (EP.2: local .wav, served .mp3), so
    // derive it from the final audioUrl extension rather than the local file.
    const audioType = AUDIO_MIME[(audioUrl.split('.').pop() || '').toLowerCase()] || 'audio/mpeg';

    // ---- episode body (status=published; one build is triggered at the very end) ----
    const body = {
      title,
      summary,                 // short → page grey line + feed <description>/<itunes:summary>
      showNotes: summary,      // short → feed <content:encoded> (episode notes in apps; full text belongs in transcript, not here)
      transcript,              // full → <podcast:transcript> + /transcript.txt (groundwork for synced display)
      audioUrl,
      audioType,
      audioSize,
      episodeNumber: epNum,
      episodeType: 'full',
      status: 'published',
      publishedAt,
      externalSource: 'local-prod',
      externalId: nn,
    };
    if (duration !== undefined) body.duration = duration;

    // Content fingerprint: skip the upsert entirely when nothing changed since the
    // last run, so a re-run is a true no-op (no write, no rebuild). A re-uploaded
    // audio file changes audioUrl/size → fingerprint differs → episode is re-pushed.
    const fingerprint = createHash('sha1').update(JSON.stringify(body)).digest('hex');
    if (!DRY && st.episodeId && st.fingerprint === fingerprint) {
      console.log(`   ${st.episodeId} = unchanged, skip`);
      continue;
    }

    if (DRY) {
      console.log(`   ${st.episodeId ? 'PUT update' : 'POST upsert'}  "${title}"  EP.${epNum}  pub=${new Date(publishedAt * 1000).toISOString().slice(0, 10)}  dur=${duration ?? '?'}s  summary=${summary.length}c transcript=${transcript.length}c`);
      continue;
    }

    try {
      let row;
      if (st.episodeId) {
        // Known id (preseeded EP.1/2, or recorded from a prior create) → update in place.
        row = await api('PUT', `/podcasts/episodes/${st.episodeId}`, body);
      } else {
        // No id yet → idempotent upsert keyed on (externalSource, externalId).
        row = await api('POST', `/podcasts/${slugPath}/episodes`, body);
        st.episodeId = row.id;
      }
      st.title = title; st.episodeNumber = epNum; st.published = true; st.fingerprint = fingerprint; st.updatedAt = Math.floor(Date.now() / 1000);
      saveState(state);
      changed++;
      console.log(`   ${st.episodeId} ✓ "${title}"  EP.${epNum}  (sum ${summary.length}c)`);
    } catch (e) {
      failures.push(`${nn}: upsert — ${e.message}`);
    }
  }

  // ---- duplicate canary + single rebuild ----
  if (!DRY) {
    try {
      const list = await api('GET', `/podcasts/${slugPath}/episodes?limit=200`);
      console.log(`\nserver episode count: ${list.total}`);
      if (!ONLY && list.total !== numbers.length) {
        console.log(`⚠️  expected ${numbers.length} episodes, found ${list.total} — possible duplicate; inspect before rebuilding.`);
      }
    } catch (e) { console.log(`(could not verify count: ${e.message})`); }

    if (changed > 0 && !NO_BUILD) {
      try { await api('POST', '/build/trigger'); console.log('build triggered ✓'); }
      catch (e) { failures.push(`build trigger — ${e.message}`); }
    } else {
      console.log(changed === 0 ? 'no changes — build skipped' : 'build skipped (--no-build)');
    }
  }

  if (failures.length) {
    console.log(`\n✗ ${failures.length} problem(s):`);
    for (const f of failures) console.log(`   - ${f}`);
    process.exit(1);
  }
  console.log(`\n✓ done — ${changed} episode(s) written`);
}

main().catch(e => { console.error(e); process.exit(1); });
