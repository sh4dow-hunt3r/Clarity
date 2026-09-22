import { CategoryKey, KNOWN_SHOPS } from '../types';

export interface ParsedTransaction {
  date: string;
  amount: number;
  description: string;
  category: CategoryKey;
  shop: string | null;
}

// Keyword → category mapping for auto-categorisation. Only covers the default
// categories — statements will fall back to 'food' if nothing matches, and can
// be recategorized manually to a custom category afterward.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: ['grocery', 'grocer', 'market', 'food', 'restaurant', 'cafe', 'coffee', 'pizza',
         'burger', 'sushi', 'costco', 'walmart', 'safeway', 'kroger', 'whole foods',
         'trader joe', 'desi mandi', 'fresh', 'bakery', 'deli'],
  clothes: ['clothing', 'apparel', 'fashion', 'zara', 'h&m', 'gap', 'old navy',
            'nordstrom', 'macy', 'target clothing', 'uniqlo', 'forever 21'],
  medicine: ['pharmacy', 'drug', 'cvs', 'walgreens', 'rite aid', 'hospital',
             'clinic', 'medical', 'health', 'dental', 'vision', 'prescription'],
  entertainment: ['netflix', 'hulu', 'spotify', 'disney', 'amazon prime', 'cinema',
                  'movie', 'theater', 'concert', 'ticket', 'game', 'steam', 'xbox',
                  'playstation', 'apple tv', 'youtube premium'],
  gifting: ['gift', 'flower', 'hallmark', '1-800-flowers', 'etsy'],
  furniture: ['ikea', 'ashley', 'wayfair', 'furniture', 'home depot furniture',
              'west elm', 'crate & barrel', 'pottery barn'],
  gym: ['gym', 'fitness', 'planet fitness', '24 hour', 'anytime fitness',
        'crossfit', 'yoga', 'pilates', 'la fitness', 'equinox'],
  fuel: ['gas', 'fuel', 'shell', 'chevron', 'bp', 'exxon', 'mobil',
         'arco', 'circle k', 'speedway', '76'],
  insurance: ['insurance', 'geico', 'state farm', 'allstate', 'progressive',
              'aaa', 'liberty mutual', 'farmers', 'nationwide'],
  utilities: ['electric', 'electricity', 'water', 'gas utility', 'internet',
              'cable', 'phone', 'at&t', 'verizon', 't-mobile', 'comcast',
              'xfinity', 'pg&e', 'sdge'],
  rent: ['rent', 'lease', 'apartment', 'property management', 'zillow rental'],
};

function inferCategory(description: string): CategoryKey {
  const lower = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'food'; // safest fallback
}

function inferShop(description: string): string | null {
  const lower = description.toLowerCase();
  for (const shop of KNOWN_SHOPS) {
    if (lower.includes(shop.toLowerCase())) return shop;
  }
  // Return first word(s) of description as shop name
  const cleaned = description.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
  return words || null;
}

// ── CSV parser (Chase, BofA, Citi, Amex common formats) ──────────────────────

function parseDate(raw: string): string {
  // Handles MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY
  const parts = raw.trim().split(/[\/\-]/);
  if (parts.length !== 3) return raw;
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
}

export function parseCsvStatement(csvText: string): ParsedTransaction[] {
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(',').map(h => h.replace(/"/g, '').trim());
  const dateIdx = header.findIndex(h => h.includes('date') && !h.includes('post'));
  const descIdx = header.findIndex(h => h.includes('description') || h.includes('merchant') || h.includes('name'));
  const amtIdx  = header.findIndex(h => h.includes('amount') || h.includes('debit'));

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= Math.max(dateIdx, descIdx, amtIdx)) continue;

    const rawAmt = cols[amtIdx].replace(/[",\$]/g, '').trim();
    const amount = parseFloat(rawAmt);
    if (isNaN(amount) || amount <= 0) continue; // skip credits/refunds

    const description = cols[descIdx].replace(/"/g, '').trim();
    const date = parseDate(cols[dateIdx].replace(/"/g, '').trim());

    results.push({
      date,
      amount,
      description,
      category: inferCategory(description),
      shop: inferShop(description),
    });
  }
  return results;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ── PDF statement parser (generic, best-effort) ───────────────────────────────
//
// PDF bank statements don't have a fixed layout like CSV — this scans extracted
// text for lines shaped like "DATE  DESCRIPTION  AMOUNT", which covers most
// common formats (Chase, BofA, Citi, Amex). Statements with multi-column
// tables or scanned (non-text) PDFs may need manual entry instead.

const PDF_LINE_REGEX = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+\$?(-?[\d,]+\.\d{2})(?=\s|$)/g;

export function parsePdfStatementText(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const currentYear = new Date().getFullYear();

  let match: RegExpExecArray | null;
  PDF_LINE_REGEX.lastIndex = 0;
  while ((match = PDF_LINE_REGEX.exec(text)) !== null) {
    const [, rawDate, rawDesc, rawAmt] = match;

    const amount = parseFloat(rawAmt.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) continue; // skip payments/credits

    const description = rawDesc.trim().replace(/\s{2,}/g, ' ');
    if (description.length < 2 || /^\d+$/.test(description)) continue;

    const dateWithYear = rawDate.split('/').length === 2 ? `${rawDate}/${currentYear}` : rawDate;

    results.push({
      date: parseDate(dateWithYear),
      amount,
      description,
      category: inferCategory(description),
      shop: inferShop(description),
    });
  }
  return results;
}

// ── OCR receipt parser ────────────────────────────────────────────────────────

export function parseReceiptText(ocrText: string): Partial<ParsedTransaction> {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);

  // Find total — look for "total", "amount due", etc.
  let amount = 0;
  for (const line of [...lines].reverse()) {
    const lower = line.toLowerCase();
    if (lower.includes('total') || lower.includes('amount due') || lower.includes('grand total')) {
      const match = line.match(/[\$]?\s*([\d,]+\.?\d{0,2})/);
      if (match) { amount = parseFloat(match[1].replace(',', '')); break; }
    }
  }

  // Date
  let date = new Date().toISOString().split('T')[0];
  for (const line of lines) {
    const match = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (match) { date = parseDate(match[0]); break; }
  }

  // Shop name — usually first non-empty line
  const shopLine = lines[0] ?? '';
  const description = shopLine || 'Receipt scan';

  return {
    date,
    amount,
    description,
    category: inferCategory(ocrText),
    shop: inferShop(ocrText) ?? shopLine,
  };
}
