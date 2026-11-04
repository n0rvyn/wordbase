export const PERIOD_DAYS: Record<string, number> = { daily: 30, weekly: 84, monthly: 365 };
export function reportingWindow(days = 30, now = Date.now()) {
  const end = Math.floor(now / 1000) + 1;
  const today = Math.floor(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) / 1000);
  return { from: today - (Math.max(1, Math.min(365, Math.floor(days))) - 1) * 86400, to: end };
}
export function bucketKey(date: Date, period: string): string {
  const year = date.getUTCFullYear();
  if (period === 'monthly') return `${year}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
  if (period === 'weekly') {
    const first = new Date(Date.UTC(year,0,1));
    const day = Math.floor((date.getTime()-first.getTime())/86400000);
    const monday = (8-first.getUTCDay())%7;
    const week = day < monday ? 0 : 1+Math.floor((day-monday)/7);
    return `${year}-W${String(week).padStart(2,'0')}`;
  }
  return date.toISOString().slice(0,10);
}
export function fillBuckets<T extends { period: string }>(rows: T[], period: string, days: number, zero: Omit<T,'period'>): T[] {
  const range=reportingWindow(days); const keys=new Set<string>();
  for(let t=range.from;t<range.to;t+=86400) keys.add(bucketKey(new Date(t*1000),period));
  const byKey=new Map(rows.map(row=>[row.period,row]));
  return [...keys].map(key=>byKey.get(key) ?? {period:key,...zero} as T);
}
