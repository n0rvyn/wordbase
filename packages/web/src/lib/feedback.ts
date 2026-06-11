export type Reaction = 'up' | 'down';
export type Category = 'repetitive' | 'disagree' | 'boring' | 'shallow' | 'great' | 'other';

export const FEEDBACK_CHIPS: { category: Category; label: string; labelEn: string }[] = [
  { category: 'great',      label: '很棒',   labelEn: 'Great' },
  { category: 'repetitive', label: '重复',   labelEn: 'Repetitive' },
  { category: 'disagree',   label: '不同意', labelEn: 'Disagree' },
  { category: 'boring',     label: '没意思', labelEn: 'Boring' },
  { category: 'shallow',    label: '太水',   labelEn: 'Shallow' },
];

export function categoryToReaction(category: Category): Reaction | null {
  if (category === 'great') return 'up';
  if (category === 'other') return null;
  return 'down';
}
