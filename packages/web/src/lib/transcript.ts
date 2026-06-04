/**
 * Transcript segmentation and progress-to-block mapping.
 *
 * Pure logic — no DOM, no fetch. Consumed by `podcast.astro`'s client script
 * to convert the raw `transcript.txt` text into blocks with `startRatio`
 * ∈ [0,1) suitable for percentage-based playback sync.
 *
 * Assumes text progress ≈ audio progress. The supporting audit measured
 * linearity on RAW character counts (`wc -m`) and found 16/18 episodes stable
 * (EP08/EP10 have incomplete audio — content issues, not this module's concern).
 * `startRatio` here is computed on CLEANED text length (markers stripped), which
 * differs from the raw counts by the marker density (<2% of chars) — negligible
 * skew, and cleaned length is arguably closer to what was actually spoken. If
 * VTT cues land later, replace the per-character `startRatio` derivation with
 * per-cue timing — the block shape and `blockAtProgress` API stay the same.
 */
import { stripInlineMarkdown } from './markdown.js';

export interface TxBlock {
  /** Cleaned plain text for display (no markdown markers). */
  text: string;
  /** True when the source block started with a `#` heading marker. */
  isHeading: boolean;
  /**
   * Cumulative character ratio in [0,1) marking the start of this block
   * within the full cleaned transcript. Monotonically increasing.
   */
  startRatio: number;
}

function clean(block: string): { text: string; isHeading: boolean } {
  // Heading flag comes from the FIRST line's marker; strip with the shared
  // stripper (run before collapsing newlines so its line-anchored `m`-flag
  // rules — bullets, blockquotes — apply per line). code:'keep' retains the
  // text inside backticks (a transcript reads those words aloud).
  const isHeading = /^#{1,6}\s+/.test(block);
  const text = stripInlineMarkdown(block, { code: 'keep' })
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, isHeading };
}

export function segmentTranscript(raw: string): TxBlock[] {
  if (!raw || !raw.trim()) return [];
  const rawBlocks = raw.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const cleaned: { text: string; isHeading: boolean }[] = [];
  for (const b of rawBlocks) {
    const t = b.trim();
    if (!t) continue;
    if (/^([-*_]\s*){3,}$/.test(t)) continue;          // --- / *** / ___ separator
    const c = clean(t);                                 // strip markers (per-line) + collapse inside clean()
    if (!c.text) continue;
    cleaned.push(c);
  }
  const total = cleaned.reduce((s, c) => s + c.text.length, 0) || 1;
  let acc = 0;
  return cleaned.map((c) => {
    const startRatio = acc / total;
    acc += c.text.length;
    return { text: c.text, isHeading: c.isHeading, startRatio };
  });
}

export function blockAtProgress(blocks: TxBlock[], p: number): number {
  if (blocks.length === 0) return -1;
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  let idx = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].startRatio <= clamped) idx = i;
    else break;
  }
  return idx;
}
