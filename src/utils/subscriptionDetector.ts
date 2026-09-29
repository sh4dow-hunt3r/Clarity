import { Transaction } from '../types';

export interface DetectedSubscription {
  key: string;
  name: string;
  category: string;
  averageAmount: number;
  intervalDays: number;
  occurrences: number;
  lastDate: string;
  estimatedNextDate: string;
  transactionIds: number[];
}

const MONTHLY_MIN_DAYS = 25;
const MONTHLY_MAX_DAYS = 35;
const AMOUNT_TOLERANCE = 0.15; // 15% variance allowed between charges

function normalizeKey(t: Transaction): string {
  return (t.shop || t.description).trim().toLowerCase().replace(/\s+/g, ' ');
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function amountsAreConsistent(amounts: number[]): boolean {
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return amounts.every(a => Math.abs(a - avg) / avg <= AMOUNT_TOLERANCE);
}

// Groups transactions by merchant and flags groups that recur roughly monthly
// with a consistent amount — the classic subscription pattern (Netflix,
// Spotify, gym memberships, etc). Requires at least 2 occurrences so a single
// purchase never gets flagged.
export function detectSubscriptions(transactions: Transaction[]): DetectedSubscription[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = normalizeKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const results: DetectedSubscription[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < 2) continue;
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const monthlyGaps = gaps.filter(g => g >= MONTHLY_MIN_DAYS && g <= MONTHLY_MAX_DAYS);
    // Require most consecutive gaps to look monthly, not just one lucky pair.
    if (monthlyGaps.length === 0 || monthlyGaps.length < gaps.length * 0.6) continue;

    const amounts = sorted.map(t => t.amount);
    if (!amountsAreConsistent(amounts)) continue;

    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const avgInterval = Math.round(monthlyGaps.reduce((s, g) => s + g, 0) / monthlyGaps.length);
    const last = sorted[sorted.length - 1];
    const estimatedNext = new Date(last.date);
    estimatedNext.setDate(estimatedNext.getDate() + avgInterval);

    results.push({
      key,
      name: last.shop || last.description,
      category: last.category,
      averageAmount: avgAmount,
      intervalDays: avgInterval,
      occurrences: sorted.length,
      lastDate: last.date,
      estimatedNextDate: estimatedNext.toISOString().split('T')[0],
      transactionIds: sorted.map(t => t.id),
    });
  }

  return results.sort((a, b) => b.averageAmount - a.averageAmount);
}
