import { describe, it, expect } from 'vitest';
import { segmentTranscript, blockAtProgress, type TxBlock } from './transcript';

// ─── segmentTranscript ────────────────────────────────────────────────────────

describe('segmentTranscript', () => {
  it('returns [] for empty string', () => {
    expect(segmentTranscript('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(segmentTranscript('   \n\n   \t  ')).toEqual([]);
  });

  it('splits on blank lines into multiple blocks', () => {
    const raw = '第一段内容。\n\n第二段内容。\n\n第三段内容。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].text).toBe('第一段内容。');
    expect(blocks[1].text).toBe('第二段内容。');
    expect(blocks[2].text).toBe('第三段内容。');
  });

  it('drops horizontal rule separator lines (---, ***, ___)', () => {
    const raw = '第一段。\n\n---\n\n第二段。\n\n***\n\n第三段。\n\n___\n\n第四段。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(4);
    expect(blocks.map((b) => b.text)).toEqual(['第一段。', '第二段。', '第三段。', '第四段。']);
  });

  it('marks heading lines (leading #) and strips the # prefix', () => {
    const raw = '# 标题\n\n正文段落。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[0].text).toBe('标题');
    expect(blocks[1].isHeading).toBe(false);
  });

  it('marks h2/h3 headings the same way', () => {
    const raw = '## 小节一\n\n## 小节二';
    const blocks = segmentTranscript(raw);
    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[0].text).toBe('小节一');
    expect(blocks[1].isHeading).toBe(true);
    expect(blocks[1].text).toBe('小节二');
  });

  it('strips bold, italic, and inline code markers from body lines', () => {
    const raw = '**加粗**段落和*斜体*以及`代码`片段。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('加粗段落和斜体以及代码片段。');
    expect(blocks[0].isHeading).toBe(false);
  });

  it('strips list/blockquote prefixes from body lines', () => {
    const raw = '- 列表项一\n\n> 引用文字';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('列表项一');
    expect(blocks[1].text).toBe('引用文字');
  });

  it('skips blocks that become empty after cleaning', () => {
    const raw = '第一段。\n\n---\n\n第二段。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(2);
  });

  it('handles a mixed realistic transcript', () => {
    const raw = `# 播客开场

大家好，欢迎收听本期节目。

## 本期主题

今天我们聊聊**AI**和*开源*。

---

下一段开始。`;
    const blocks = segmentTranscript(raw);
    // 期望：标题「播客开场」、正文「大家好...」、标题「本期主题」、正文「今天...」、正文「下一段开始。」
    // --- 分隔行被丢弃
    expect(blocks.map((b) => b.text)).toEqual([
      '播客开场',
      '大家好，欢迎收听本期节目。',
      '本期主题',
      '今天我们聊聊AI和开源。',
      '下一段开始。',
    ]);
    expect(blocks[0].isHeading).toBe(true);
    expect(blocks[1].isHeading).toBe(false);
    expect(blocks[2].isHeading).toBe(true);
    expect(blocks[3].isHeading).toBe(false);
    expect(blocks[4].isHeading).toBe(false);
  });

  it('handles CRLF line endings', () => {
    const raw = '第一段。\r\n\r\n第二段。';
    const blocks = segmentTranscript(raw);
    expect(blocks).toHaveLength(2);
  });

  // ── startRatio 约束 ──

  it('first block has startRatio === 0', () => {
    const blocks = segmentTranscript('第一段。\n\n第二段。\n\n第三段。');
    expect(blocks[0].startRatio).toBe(0);
  });

  it('startRatio is strictly monotonically increasing', () => {
    const blocks = segmentTranscript('第一段内容。\n\n第二段内容。\n\n第三段内容。');
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startRatio).toBeGreaterThan(blocks[i - 1].startRatio);
    }
  });

  it('last block has startRatio < 1', () => {
    const blocks = segmentTranscript('第一段。\n\n第二段。\n\n第三段。');
    expect(blocks.at(-1)!.startRatio).toBeLessThan(1);
  });
});

// ─── blockAtProgress ──────────────────────────────────────────────────────────

describe('blockAtProgress', () => {
  const blocks: TxBlock[] = segmentTranscript('第一段。\n\n第二段。\n\n第三段。\n\n第四段。');
  // 4 段各 3 字符（不含句号也算），但 text 含句号所以长度不同
  // 段1: "第一段。"(4), 段2: "第二段。"(4), 段3: "第三段。"(4), 段4: "第四段。"(4)
  // startRatios: 0, 0.25, 0.5, 0.75

  it('returns -1 for empty blocks', () => {
    expect(blockAtProgress([], 0.5)).toBe(-1);
  });

  it('returns 0 for p = 0', () => {
    expect(blockAtProgress(blocks, 0)).toBe(0);
  });

  it('returns last block index for p = 1', () => {
    expect(blockAtProgress(blocks, 1)).toBe(blocks.length - 1);
  });

  it('returns last block index for p > 1 (clamped)', () => {
    expect(blockAtProgress(blocks, 1.5)).toBe(blocks.length - 1);
  });

  it('returns 0 for p < 0 (clamped)', () => {
    expect(blockAtProgress(blocks, -0.5)).toBe(0);
  });

  it('returns the block whose startRatio is at or before p', () => {
    // 取一个落在第 1 段 startRatio(0.25) 与第 2 段 startRatio(0.5) 之间的 p
    expect(blockAtProgress(blocks, 0.3)).toBe(1);
    // 落在第 2 段与第 3 段之间
    expect(blockAtProgress(blocks, 0.6)).toBe(2);
    // 落在第 3 段与第 4 段之间
    expect(blockAtProgress(blocks, 0.8)).toBe(3);
  });

  it('returns the block that contains p (p exactly at a startRatio boundary)', () => {
    // p 恰好等于某段 startRatio → 该段（"起始"就属于该段）
    expect(blockAtProgress(blocks, 0.25)).toBe(1);
    expect(blockAtProgress(blocks, 0.5)).toBe(2);
  });
});
