import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getTransactions, getMonthlySummary, getCustomCategories } from '../db/database';
import { DEFAULT_CATEGORIES } from '../types';

async function buildCategoryLabelMap(): Promise<Record<string, string>> {
  const custom = await getCustomCategories();
  const map: Record<string, string> = {};
  for (const c of [...DEFAULT_CATEGORIES, ...custom]) map[c.key] = c.label;
  return map;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCell).join(',');
}

export async function exportTransactionsCsv(year?: number, month?: number): Promise<void> {
  const [txns, labelMap] = await Promise.all([
    getTransactions({ year, month }),
    buildCategoryLabelMap(),
  ]);

  const headers = ['Date', 'Description', 'Shop', 'Category', 'Subcategory', 'Amount', 'Source', 'Notes'];
  const rows = txns.map(t => rowToCsv([
    t.date, t.description, t.shop, labelMap[t.category] ?? t.category,
    t.subcategory, t.amount.toFixed(2), t.source, t.notes,
  ]));

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = month
    ? `clarity_${year}_${String(month).padStart(2,'0')}.csv`
    : `clarity_${year ?? 'all'}.csv`;

  const path = `${FileSystemLegacy.cacheDirectory}${filename}`;
  await FileSystemLegacy.writeAsStringAsync(path, csv, { encoding: FileSystemLegacy.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Transactions' });
}

export async function exportMonthlySummaryCsv(year: number): Promise<void> {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const custom = await getCustomCategories();
  const allCategories = [...DEFAULT_CATEGORIES, ...custom];

  const headers = ['Month', 'Total', ...allCategories.map(c => c.label)];
  const rows: string[] = [];

  for (let m = 1; m <= 12; m++) {
    const summary = await getMonthlySummary(year, m);
    if (summary.total === 0) continue;
    const row = [
      monthNames[m - 1],
      summary.total.toFixed(2),
      ...allCategories.map(c => (summary.by_category[c.key] ?? 0).toFixed(2)),
    ];
    rows.push(row.join(','));
  }

  const csv = [headers.join(','), ...rows].join('\n');
  const path = `${FileSystemLegacy.cacheDirectory}clarity_summary_${year}.csv`;
  await FileSystemLegacy.writeAsStringAsync(path, csv, { encoding: FileSystemLegacy.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Monthly Summary' });
}
