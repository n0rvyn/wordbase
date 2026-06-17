#!/usr/bin/env node
// Podcast stage — promote finished episodes from the production CONTENT dir into the
// publish media dir, in the NN_<title> layout that podcast-ingest.mjs expects.
//
// Source layout (one set per episode, at the top level of PODCAST_SOURCE_DIR):
//   YYYY-MM-DD-<title>.{mp3,m4a,wav,…}   ← audio
//   YYYY-MM-DD-<title>.{md,txt}          ← full transcript (same base name)
//
// For every date-named pair it gates on REAL integrity, then renames to the next
// zero-padded episode number and MOVES the pair into the media dir (mtime preserved,
// so podcast-ingest.mjs derives the right publishedAt). The date prefix is dropped —
// the published date comes from the audio mtime, matching EP16–41. Integrity gates:
//   1. duration ≥ --min-minutes (default 15)              [ffprobe]
//   2. clean full decode, no corruption / truncation      [ffmpeg -f null]
//   3. real loudness + no long dead stretch (not silent)  [volumedetect/silencedetect]
//   4. (--asr) Apple speech recognition finds real speech [asr-check.swift]
//
// It NEVER publishes. After staging, run the wb-podcast-publish skill / podcast-ingest.mjs
// to write each NN.summary.txt and push to prod.
//
// Usage:
//   node scripts/podcast-stage.mjs --dry-run        # scan + integrity + plan, no move
//   node scripts/podcast-stage.mjs                  # stage (move) the passing episodes
//   node scripts/podcast-stage.mjs --asr            # also run the ASR speech-integrity gate
//   node scripts/podcast-stage.mjs --min-minutes 15 # duration floor (default 15)
//
// Env overrides: PODCAST_SOURCE_DIR, PODCAST_MEDIA_DIR.

import { existsSync, readdirSync, statSync, renameSync, copyFileSync, unlinkSync, utimesSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SOURCE_DIR = process.env.PODCAST_SOURCE_DIR || join(homedir(), 'Code/Content/Podcasts');
const MEDIA_DIR = process.env.PODCAST_MEDIA_DIR || join(homedir(), 'Downloads/AI-Audios/00-Prod-Podcasts');
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ASR_SWIFT = join(SCRIPT_DIR, 'asr-check.swift');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ASR = argv.includes('--asr');
const MIN_MIN = (() => { const i = argv.indexOf('--min-minutes'); return i >= 0 ? parseFloat(argv[i + 1]) : 15; })();
const MIN_SEC = Math.round(MIN_MIN * 60);

const AUDIO_EXT = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg']);
const TEXT_EXT = ['md', 'txt'];

// Integrity thresholds. Real 拾余光 episodes measure mean ≈ -23 dB / peak ≈ -0.4 dB;
// digital silence is -91 dB on both, so these floors cleanly separate the two.
const MEAN_FLOOR = -45;        // dB — mean loudness must clear this
const MAX_FLOOR = -10;         // dB — a real peak should approach 0
const SILENCE_DB = -45;        // dB — threshold for "silence"
const SILENCE_MAX_SEC = 30;    // a single dead stretch this long ⇒ dropout
const ASR_CLIP_SEC = 60;       // transcribe the first minute
const ASR_MIN_CJK = 20;        // expect at least this many Chinese chars from it

if (!existsSync(SOURCE_DIR)) { console.error(`✗ source dir not found: ${SOURCE_DIR}`); process.exit(1); }
if (!existsSync(MEDIA_DIR)) { console.error(`✗ media dir not found: ${MEDIA_DIR}`); process.exit(1); }

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

// ---- discovery -------------------------------------------------------------
// Anchor on the audio file; require a sibling transcript of the same base name.
function scanSource() {
  const cands = [];
  for (const f of readdirSync(SOURCE_DIR)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.([A-Za-z0-9]+)$/);
    if (!m) continue;
    const [, date, title, extRaw] = m;
    const ext = extRaw.toLowerCase();
    if (!AUDIO_EXT.has(ext)) continue;
    const base = f.slice(0, -(extRaw.length + 1));
    let textFile = null;
    for (const te of TEXT_EXT) {
      if (existsSync(join(SOURCE_DIR, `${base}.${te}`))) { textFile = `${base}.${te}`; break; }
    }
    cands.push({ date, title, audioFile: f, audioExt: ext, textFile });
  }
  // Chronological: by date, then by audio mtime (so same-day morning sorts before evening).
  cands.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    statSync(join(SOURCE_DIR, a.audioFile)).mtimeMs - statSync(join(SOURCE_DIR, b.audioFile)).mtimeMs);
  return cands;
}

// Highest NN_ already in the media dir (read ≥2 digits so the count stays correct past 99).
function highestNumber() {
  let max = 0;
  for (const f of readdirSync(MEDIA_DIR)) {
    const m = f.match(/^(\d{2,})_/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// ---- integrity gates -------------------------------------------------------
function probeDuration(p) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  const secs = parseFloat((r.stdout || '').trim());
  return Number.isFinite(secs) ? secs : null;
}

function decodeClean(p) {
  // Decode the entire file; any error-level line ⇒ corruption / truncation.
  const r = run('ffmpeg', ['-v', 'error', '-i', p, '-f', 'null', '-']);
  const noise = (r.stderr || '').trim();
  return { ok: r.status === 0 && noise === '', detail: noise.split('\n')[0] || '' };
}

function loudness(p) {
  const r = run('ffmpeg', ['-hide_banner', '-i', p,
    '-af', `volumedetect,silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_MAX_SEC}`,
    '-f', 'null', '-']);
  const s = r.stderr || '';
  const mean = (s.match(/mean_volume:\s*(-?[\d.]+) dB/) || [])[1];
  const max = (s.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1];
  const longSilences = (s.match(/silence_start:/g) || []).length; // d=SILENCE_MAX_SEC ⇒ only long ones
  return { mean: mean !== undefined ? parseFloat(mean) : null, max: max !== undefined ? parseFloat(max) : null, longSilences };
}

// Trim the first ASR_CLIP_SEC to a temp 16 kHz mono wav and ask Apple's recognizer.
function asrCheck(p) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-asr-'));
  const clip = join(dir, 'clip.wav');
  try {
    const t = run('ffmpeg', ['-v', 'error', '-y', '-t', String(ASR_CLIP_SEC), '-i', p, '-ar', '16000', '-ac', '1', clip]);
    if (t.status !== 0 || !existsSync(clip)) return { ok: false, reason: `trim failed: ${(t.stderr || '').split('\n')[0]}` };
    const r = run('swift', [ASR_SWIFT, clip]);
    const mode = ((r.stderr || '').match(/\[asr\] (mode=\S+)/) || [])[1] || '';
    if (r.status !== 0) {
      const why = (r.stderr || '').split('\n').filter(Boolean).pop() || `exit ${r.status}`;
      return { ok: false, reason: why, mode };
    }
    const text = (r.stdout || '').trim();
    const cjk = (text.match(/[一-鿿]/g) || []).length;
    return { ok: cjk >= ASR_MIN_CJK, cjk, mode, snippet: text.slice(0, 40) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function evaluate(c) {
  const reasons = [];
  const info = {};
  if (!c.textFile) { reasons.push('no transcript'); return { pass: false, reasons, info }; }

  const audioPath = join(SOURCE_DIR, c.audioFile);
  const dur = probeDuration(audioPath);
  info.dur = dur;
  if (dur === null) reasons.push('duration unreadable');
  else if (dur < MIN_SEC) reasons.push(`too short ${(dur / 60).toFixed(1)}m < ${MIN_MIN}m`);

  const dec = decodeClean(audioPath);
  if (!dec.ok) reasons.push(`decode error${dec.detail ? `: ${dec.detail}` : ''}`);

  const ld = loudness(audioPath);
  info.mean = ld.mean; info.max = ld.max;
  if (ld.mean === null || ld.mean <= MEAN_FLOOR) reasons.push(`too quiet (mean ${ld.mean ?? '?'} dB)`);
  if (ld.max === null || ld.max <= MAX_FLOOR) reasons.push(`no real peak (max ${ld.max ?? '?'} dB)`);
  if (ld.longSilences > 0) reasons.push(`${ld.longSilences} dead stretch ≥${SILENCE_MAX_SEC}s`);

  // ASR only when the cheap gates already pass — no point transcribing a broken file.
  if (ASR && reasons.length === 0) {
    const a = asrCheck(audioPath);
    info.asr = a;
    if (!a.ok) reasons.push(`ASR: ${a.reason || `only ${a.cjk} CJK chars`}`);
  }

  return { pass: reasons.length === 0, reasons, info };
}

// Move keeping mtime (rename keeps it inherently; cross-device copy restores it).
function movePreserve(src, dst) {
  const st = statSync(src);
  try { renameSync(src, dst); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e;
    copyFileSync(src, dst);
    utimesSync(dst, st.atime, st.mtime);
    unlinkSync(src);
  }
}

function pad2(n) { return String(n).padStart(2, '0'); }

function main() {
  const cands = scanSource();
  console.log(`${DRY ? '[DRY] ' : ''}staging from ${SOURCE_DIR}\n           into ${MEDIA_DIR}`);
  if (cands.length === 0) { console.log('\nno date-named episode pairs in source — nothing to stage.'); return; }

  let next = highestNumber() + 1;
  const moves = [];
  const held = [];

  console.log(`\nfound ${cands.length} candidate(s); next episode number = ${pad2(next)}\n`);
  for (const c of cands) {
    const { pass, reasons, info } = evaluate(c);
    const stat = [
      info.dur != null ? `${(info.dur / 60).toFixed(1)}m` : 'dur?',
      info.mean != null ? `mean ${info.mean}dB` : '',
      info.asr ? `asr ${info.asr.cjk ?? 0}cjk${info.asr.mode ? ` ${info.asr.mode}` : ''}` : '',
    ].filter(Boolean).join('  ');

    if (!pass) {
      held.push(c);
      console.log(`  ✗ HOLD  ${c.date}-${c.title}\n           ${stat}\n           reason: ${reasons.join('; ')}`);
      continue;
    }
    const nn = pad2(next++);
    const textExt = c.textFile.slice(c.textFile.lastIndexOf('.') + 1);
    const audioDst = `${nn}_${c.title}.${c.audioExt}`;
    const textDst = `${nn}_${c.title}.${textExt}`;
    moves.push({ c, nn, audioDst, textDst });
    console.log(`  ✓ EP.${nn}  ${c.title}\n           ${stat}\n           ${c.audioFile}  +  ${c.textFile}\n           → ${audioDst}  +  ${textDst}`);
  }

  if (moves.length === 0) {
    console.log(`\nnothing passed the integrity gates (${held.length} held). nothing moved.`);
    process.exit(held.length ? 1 : 0);
  }

  if (DRY) {
    console.log(`\n[DRY] would stage ${moves.length} episode(s); ${held.length} held. No files moved.`);
    if (next - 1 > 99) console.log('⚠️  episode number > 99 — podcast-ingest.mjs discover() matches only \\d{2}; widen it first.');
    return;
  }

  // Collision-safe move: refuse if either target already exists; move audio then text,
  // rolling the audio back if the transcript move fails, so a pair is never half-staged.
  let staged = 0;
  for (const mv of moves) {
    const aSrc = join(SOURCE_DIR, mv.c.audioFile), aDst = join(MEDIA_DIR, mv.audioDst);
    const tSrc = join(SOURCE_DIR, mv.c.textFile), tDst = join(MEDIA_DIR, mv.textDst);
    if (existsSync(aDst) || existsSync(tDst)) { console.log(`  ⚠️  EP.${mv.nn} target exists — skipped`); continue; }
    try {
      movePreserve(aSrc, aDst);
      try { movePreserve(tSrc, tDst); }
      catch (e) { movePreserve(aDst, aSrc); throw e; }
      staged++;
      console.log(`  moved EP.${mv.nn}  ${mv.audioDst}`);
    } catch (e) { console.log(`  ✗ EP.${mv.nn} move failed: ${e.message}`); }
  }

  console.log(`\n✓ staged ${staged} episode(s); ${held.length} held.`);
  if (next - 1 > 99) console.log('⚠️  episode number > 99 — podcast-ingest.mjs discover() matches only \\d{2}; widen it before publishing.');
  console.log('next: run the wb-podcast-publish flow (write each NN.summary.txt, then podcast-ingest.mjs) to publish.');
}

main();
