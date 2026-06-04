import { describe, it, expect } from 'vitest';
import { FEEDBACK_CHIPS, categoryToReaction } from './feedback';

describe('feedback lib', () => {
  it('FEEDBACK_CHIPS lists the five visible categories in order: great, repetitive, disagree, boring, shallow', () => {
    expect(FEEDBACK_CHIPS).toEqual([
      { category: 'great',      label: '很棒' },
      { category: 'repetitive', label: '重复' },
      { category: 'disagree',   label: '不同意' },
      { category: 'boring',     label: '没意思' },
      { category: 'shallow',    label: '太水' },
    ]);
  });

  it('categoryToReaction: great => up', () => {
    expect(categoryToReaction('great')).toBe('up');
  });

  it('categoryToReaction: repetitive/disagree/boring/shallow => down', () => {
    expect(categoryToReaction('repetitive')).toBe('down');
    expect(categoryToReaction('disagree')).toBe('down');
    expect(categoryToReaction('boring')).toBe('down');
    expect(categoryToReaction('shallow')).toBe('down');
  });

  it('categoryToReaction: other => null', () => {
    expect(categoryToReaction('other')).toBeNull();
  });
});
