export type Reaction = 'up' | 'down';
export type Category = 'repetitive' | 'disagree' | 'boring' | 'shallow' | 'great' | 'other';

export const FEEDBACK_CHIPS: { category: Category; label: string }[] = [
  { category: 'great',      label: '很棒' },
  { category: 'repetitive', label: '重复' },
  { category: 'disagree',   label: '不同意' },
  { category: 'boring',     label: '没意思' },
  { category: 'shallow',    label: '太水' },
];

export function categoryToReaction(category: Category): Reaction | null {
  if (category === 'great') return 'up';
  if (category === 'other') return null;
  return 'down';
}
